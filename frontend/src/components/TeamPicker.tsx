/**
 * Loyiha yaratilishidan OLDIN jamoaga kimni chaqirishni va kimga qaysi
 * vazifa tegishini belgilash.
 *
 * A'zolik ham, vazifa ham mavjud loyihaga yoziladi — ya'ni id kerak, yangi
 * loyiha esa hali yaratilmagan. Shuning uchun bu yerda hammasi faqat ro'yxatga
 * yig'iladi; forma saqlangach yangi id bilan yuboriladi (`addPickedMembers`,
 * `createPickedTasks`).
 *
 * Odam qidiruvi umumiy foydalanuvchi katalogidan (`/users/?search=`) boradi:
 * yangi loyihada hali a'zo yo'q, shuning uchun `/team/candidates/` dan
 * foydalanib bo'lmaydi — u mavjud loyihani talab qiladi.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, listOf } from "@/api/client";
import type { Choice, Task, UserBrief } from "@/api/types";
import { MAX_FILE_BYTES, fileSize, uploadFiles } from "./FilePicker";
import UserSearch from "./UserSearch";
import { IconCheck, IconClose, IconFile, IconPlus } from "./icons";
import { Avatar, DateField, fromDateTimeInput, SpecialtyTag } from "./ui";
import { useAuth } from "@/auth/AuthContext";
import { tx } from "@/i18n";

/** Odamga atab yozilgan, hali yaratilmagan vazifa. */
export interface PickTask {
  title: string;
  priority: number;
  /** "YYYY-MM-DD" yoki bo'sh — ish oynasi, ikkalasi ham ixtiyoriy */
  start_date: string;
  due_date: string;
  /** Vazifa yaratilgandan keyin biriktiriladigan fayllar */
  files: File[];
}

export interface Pick {
  user: UserBrief;
  role: string;
  tasks: PickTask[];
  /** Yozilayotgan, lekin hali «Qoshish» bosilmagan vazifa.
      Shu yerda turgani uchun forma saqlanganda ham yo'qolmaydi. */
  draft: PickTask;
  /**
   * Ochilgan vazifa: qaysi qator (`index`) va uning tahrirdagi holati.
   *
   * Qoralama kabi bu ham `Pick` ichida turadi, komponent holatida emas:
   * odam «Saqlash» ni bosmasdan formani yuborsa ham yozgani yo'qolmasin
   * (`tasksOf` uni hisobga oladi).
   */
  edit?: { index: number; task: PickTask } | null;
}

export const emptyTask = (): PickTask => ({
  title: "", priority: 2, start_date: "", due_date: "", files: [],
});

/**
 * Odamga tegishli hamma vazifa: qo'shilganlar + to'ldirilgan qoralama.
 *
 * Ochiq tahrir ham shu yerda qo'llanadi - yozilgani o'z qatorining o'rniga
 * tushadi. Aks holda odam vazifani ochib tuzatib, «Saqlash» o'rniga to'g'ridan
 * to'g'ri formani yuborsa, tuzatishi jimgina yo'qolardi.
 */
export function tasksOf(p: Pick) {
  const edit = p.edit;
  const list = edit && edit.task.title.trim()
    ? p.tasks.map((t, i) => (i === edit.index
        ? { ...edit.task, title: edit.task.title.trim() } : t))
    : p.tasks;
  return p.draft.title.trim()
    ? [...list, { ...p.draft, title: p.draft.title.trim() }]
    : list;
}

/** Ekranda yangisi tepada turadi; serverga esa qo'shilgan tartibda boradi. */
const inAddedOrder = (picks: Pick[]) => [...picks].reverse();

/**
 * Yig'ilgan odamlarni jamoaga qo'shadi — darrov, tasdiq kutmasdan.
 * Qo'shib bo'lmaganlarning ismini qaytaradi — chaqiruvchi shuni aytadi.
 */
export async function addPickedMembers(projectId: number, picks: Pick[]) {
  const failed: string[] = [];
  // Ro'yxat yangisi tepada bo'lib ko'rsatiladi, qo'shish esa qo'shilgan
  // tartibda boradi - vazifa raqamlari kiritilish tartibiga mos tushsin.
  for (const p of inAddedOrder(picks)) {
    try {
      await api.post("/team/add/", {
        project: projectId,
        user_id: p.user.id,
        role: p.role,
      });
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
      if (!msg.includes("allaqachon")) {
        failed.push(p.user.full_name);
      }
    }
  }
  return failed;
}

/**
 * Yig'ilgan vazifalarni yaratadi, egasiga biriktiradi va fayllarini yuklaydi.
 *
 * Odam allaqachon a'zo bo'lgani uchun vazifa darrov uning «Mening ishlarim»
 * ro'yxatida va doskada ko'rinadi.
 *
 * Fayl vazifa yaratilgandan keyin biriktiriladi - avval id kerak. Fayl
 * yuklanmasa vazifa o'chirilmaydi: qaysi vazifaning fayli qolib ketgani
 * alohida qaytariladi, odam uni vazifa sahifasidan qayta yuklaydi.
 */
export async function createPickedTasks(projectId: number, picks: Pick[], isBoss = false) {
  const failedTasks: string[] = [];
  const failedFiles: string[] = [];
  for (const p of inAddedOrder(picks)) {
    if (
      p.user.is_platform_admin ||
      p.user.is_boss ||
      p.user.global_role === "ADMIN" ||
      p.user.global_role === "BOSS" ||
      (!isBoss && (p.user.global_role === "MANAGER" || p.user.specialty === "PM" || p.user.is_manager))
    ) {
      continue;
    }
    for (const t of tasksOf(p)) {
      let task: Task;
      try {
        task = await api.post<Task>("/tasks/", {
          project: projectId,
          title: t.title,
          priority: t.priority,
          status: "TODO",
          assignee_ids: [p.user.id],
          // Boshlanish - kunning boshi, muddat esa oxiri: aks holda ish
          // boshlanadigan kuni ertalab "kechikdi" bo'lib turardi.
          start_date: t.start_date ? fromDateTimeInput(`${t.start_date}T00:00`) : null,
          due_date: t.due_date ? fromDateTimeInput(`${t.due_date}T23:59`) : null,
        });
      } catch {
        failedTasks.push(t.title);
        continue;
      }
      if (t.files.length) {
        try {
          await uploadFiles(`/tasks/${task.id}/attachments/`, t.files);
        } catch {
          failedFiles.push(t.title);
        }
      }
    }
  }
  return { failedTasks, failedFiles };
}

export function taskCount(picks: Pick[]) {
  return picks.reduce((n, p) => n + tasksOf(p).length, 0);
}

/** "2026-08-20" -> "20.08.2026". Maydon qiymati mintaqasiz — shunday
    o'giramiz, `new Date` orqali o'tkazsak kun surilib ketishi mumkin. */
const dmy = (value: string) => value.split("-").reverse().join(".");

interface Props {
  picks: Pick[];
  onChange: (picks: Pick[]) => void;
  roles: Choice[];
  priorities: Choice[];
  defaultRole?: string;
  /** O'zini qo'sha olmaydi — ro'yxatdan chiqarib tashlanadi. */
  excludeId?: number;
  /** Loyiha boshlanish sanasi - vazifalar undan oldin boshlanishi mumkin emas */
  projectStartDate?: string;
  /** Loyiha tugash muddati */
  projectDueDate?: string;
}

export default function TeamPicker({
  picks, onChange, roles, priorities, defaultRole = "DEVELOPER", excludeId,
  projectStartDate, projectDueDate,
}: Props) {
  const { user } = useAuth();
  const isBoss = Boolean(user?.is_boss || user?.global_role === "BOSS");
  const isExcludedFromTasks = (u: UserBrief) =>
    u.is_platform_admin ||
    u.is_boss ||
    u.global_role === "ADMIN" ||
    u.global_role === "BOSS" ||
    (!isBoss && (u.global_role === "MANAGER" || u.specialty === "PM" || u.is_manager));

  const search = useCallback(async (q: string) => {
    const data = await api.get<any>("/users/", { search: q, page_size: 8, exclude_management: "1" });
    return listOf<UserBrief>(data).filter(
      (u) => u.id !== excludeId &&
             u.global_role !== "ADMIN" &&
             u.global_role !== "BOSS" &&
             !u.is_platform_admin &&
             !u.is_boss &&
             !picks.some((p) => p.user.id === u.id));
  }, [excludeId, picks]);

  /** Bitta odamning yozuvini yangilaydi — qolganlariga tegmaydi. */
  const patch = (i: number, part: Partial<Pick>) =>
    onChange(picks.map((x, n) => (n === i ? { ...x, ...part } : x)));

  // Loyihaning boshlanish sanasi o'zgarganda, barcha kiritilgan vazifalarning
  // boshlanish sanasi loyiha boshlanishidan oldin bo'lib qolmasligini ta'minlash
  useEffect(() => {
    if (!projectStartDate) return;
    let hasChange = false;
    const nextPicks = picks.map((p) => {
      let pChanged = false;
      const nextTasks = p.tasks.map((t) => {
        if (t.start_date && t.start_date < projectStartDate) {
          pChanged = true;
          const newDue = t.due_date && t.due_date < projectStartDate ? projectStartDate : t.due_date;
          return { ...t, start_date: projectStartDate, due_date: newDue };
        }
        return t;
      });
      let nextDraft = p.draft;
      if (p.draft.start_date && p.draft.start_date < projectStartDate) {
        pChanged = true;
        const newDue = p.draft.due_date && p.draft.due_date < projectStartDate ? projectStartDate : p.draft.due_date;
        nextDraft = { ...p.draft, start_date: projectStartDate, due_date: newDue };
      }
      let nextEdit = p.edit;
      if (p.edit?.task?.start_date && p.edit.task.start_date < projectStartDate) {
        pChanged = true;
        const newDue = p.edit.task.due_date && p.edit.task.due_date < projectStartDate ? projectStartDate : p.edit.task.due_date;
        nextEdit = {
          ...p.edit,
          task: { ...p.edit.task, start_date: projectStartDate, due_date: newDue },
        };
      }
      if (pChanged) {
        hasChange = true;
        return { ...p, tasks: nextTasks, draft: nextDraft, edit: nextEdit };
      }
      return p;
    });
    if (hasChange) {
      onChange(nextPicks);
    }
  }, [projectStartDate]);

  const total = taskCount(picks);

  return (
    <>
      {/* Yangi qo'shilgan odam ro'yxat BOSHIGA tushadi: ishlanayotgan
          odam ko'z oldida tursin, pastga qarab surilib ketmasin. */}
      <UserSearch
        search={search}
        onPick={(u) => onChange([
          { user: u, role: defaultRole, tasks: [], draft: emptyTask() },
          ...picks,
        ])}
        placeholder={tx("team_picker.email_yoki_ism_familiya")}
        emptyText={tx("common.hech_kim_topilmadi")}
        clearOnPick
      />

      {!!picks.length && (
        <div className="stack" style={{ marginTop: 12 }}>
          {picks.map((p, i) => (
            <div className="pick" key={p.user.id}>
              <div className="row">
                <Avatar user={p.user} size="sm" />
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 13 }}>{p.user.full_name}</strong>{" "}
                  <SpecialtyTag user={p.user} compact />
                  <br />
                  <small className="muted">{p.user.email}</small>
                </div>
                <span className="spacer" />
                <button type="button" className="btn btn-sm" title={tx("team_picker.royxatdan_olib_tashlash")}
                        onClick={() => onChange(picks.filter((_, n) => n !== i))}>
                  <IconClose size={13} />
                </button>
              </div>

              <select value={p.role} onChange={(e) => patch(i, { role: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.value} value={String(r.value)}>{r.label}</option>
                ))}
              </select>

              {isExcludedFromTasks(p.user) ? (
                <div className="muted" style={{ padding: "8px 12px", fontSize: 12, fontStyle: "italic" }}>
                  {p.user.global_role === "MANAGER" || p.user.specialty === "PM" || p.user.is_manager
                    ? tx("team_picker.pmga_faqat_boshliq_vazifa_beradi", undefined, "PM (Loyiha menejeri)ga faqat Boshliq vazifa bera oladi")
                    : tx("team_picker.admin_va_boshliqqa_vazifa_berilmaydi", undefined, "Bosh admin va Boshliqqa vazifa biriktirilmaydi")}
                </div>
              ) : (
                <div className="pick-tasks">
                  {p.tasks.map((t, n) => (
                    p.edit && p.edit.index === n ? (
                      /* Tahrir aynan SHU qatorning o'rnida ochiladi - odam
                         qaysi vazifani ochganini ko'rib tursin. */
                      <TaskAdder
                        key={n}
                        priorities={priorities}
                        value={p.edit.task}
                        onValue={(d) => patch(i, { edit: { index: n, task: d } })}
                        onSubmit={(saved) => patch(i, {
                          tasks: p.tasks.map((old, k) => (k === n ? saved : old)),
                          edit: null,
                        })}
                        onCancel={() => patch(i, { edit: null })}
                        projectStartDate={projectStartDate}
                        projectDueDate={projectDueDate}
                      />
                    ) : (
                      <div className="pick-task" key={n}>
                        {/* Nomini bosish vazifani OCHADI. Ilgari qatorda faqat
                            o'chirish tugmasi bor edi: sarlavhada xato ketsa yoki
                            sana o'zgarsa, vazifani o'chirib qaytadan yozib
                            chiqishdan boshqa yo'l yo'q edi. */}
                        <button type="button" className="pick-task-title" title={t.title}
                                onClick={() => patch(i, { edit: { index: n, task: t } })}>
                          {t.title}
                        </button>
                        <span className={`pri pri-${t.priority}`}>
                          {priorities.find((x) => Number(x.value) === t.priority)?.label}
                        </span>
                        {(t.start_date || t.due_date) && (
                          <small className="muted nowrap">
                            {t.start_date && dmy(t.start_date)}
                            {t.start_date && t.due_date && " → "}
                            {t.due_date && dmy(t.due_date)}
                          </small>
                        )}
                        {!!t.files.length && (
                          <small className="muted nowrap" title={t.files.map((f) => f.name).join(", ")}>
                            <IconFile size={11} /> {t.files.length}
                          </small>
                        )}
                        <button type="button" className="chip-x" title={tx("team_picker.vazifani_olib_tashlash")}
                                onClick={() => patch(i, {
                                  tasks: p.tasks.filter((_, k) => k !== n),
                                  // Qator o'chsa ochiq tahrirning indeksi siljiydi:
                                  // o'chirilgani tahrirdagidan OLDINDA bo'lsa, u bir
                                  // qator yuqoriga ko'chadi; o'zi o'chsa - yopiladi.
                                  edit: !p.edit || p.edit.index === n ? null
                                    : { ...p.edit,
                                        index: p.edit.index - (p.edit.index > n ? 1 : 0) },
                                })}>
                          <IconClose size={9} />
                        </button>
                      </div>
                    )
                  ))}

                  {/* Tahrir ochiq turganda yangi vazifa formasi ko'rinmaydi -
                      bitta katakda ikkita bir xil forma chalkashtirardi. */}
                  {!p.edit && (
                    <TaskAdder
                      priorities={priorities}
                      value={p.draft}
                      onValue={(d) => patch(i, { draft: d })}
                      onSubmit={(t) => patch(i, { tasks: [...p.tasks, t], draft: emptyTask() })}
                      projectStartDate={projectStartDate}
                      projectDueDate={projectDueDate}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="muted" style={{ fontSize: 12 }}>
            {picks.length} {tx("team_picker.ta_azo")}
            {total > 0 && <> · {total} {tx("team_picker.ta_vazifa")}</>}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Bitta vazifa formasi - YANGI vazifa yozish uchun ham, mavjudini
 * TAHRIRLASH uchun ham. `onCancel` berilsa tahrir rejimi: tugma «Saqlash»
 * bo'ladi va yonida «Bekor qilish» turadi.
 *
 * Bitta forma ikki ishga xizmat qiladi - maydonlar (sarlavha, ish oynasi,
 * muhimlik, fayllar) ikki joyda takrorlanmasin va bittasi tuzatilganda
 * ikkinchisi eskirib qolmasin.
 *
 * Qiymat bu yerda emas, `Pick` ichida turadi (`draft` yoki `edit.task`):
 * odam «Qoshish»/«Saqlash» ni bosmasa ham, forma yuborilganda yozgani
 * saqlanadi. Avval qoralama shu komponent ichida turardi va jimgina
 * yo'qolib ketardi.
 */
function TaskAdder({ priorities, value, onValue, onSubmit, onCancel, projectStartDate, projectDueDate }: {
  priorities: Choice[];
  value: PickTask;
  onValue: (task: PickTask) => void;
  onSubmit: (task: PickTask) => void;
  /** Berilsa - tahrir rejimi. */
  onCancel?: () => void;
  projectStartDate?: string;
  projectDueDate?: string;
}) {
  const [tooBig, setTooBig] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const editing = Boolean(onCancel);

  const set = (part: Partial<PickTask>) => onValue({ ...value, ...part });

  /** Tanlangan yoki sudrab tashlangan fayllarni vazifaga qo'shadi. */
  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const picked = Array.from(list);
    // Katta faylni shu yerdayoq to'samiz - server 400 qaytarguncha kutmaymiz.
    setTooBig(picked.filter((f) => f.size > MAX_FILE_BYTES).map((f) => f.name));
    const seen = new Set(value.files.map((f) => `${f.name}:${f.size}`));
    set({ files: [...value.files, ...picked.filter(
      (f) => f.size <= MAX_FILE_BYTES && !seen.has(`${f.name}:${f.size}`))] });
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit() {
    const clean = value.title.trim();
    if (!clean) return;
    let startDate = value.start_date;
    if (startDate && projectStartDate && startDate < projectStartDate) {
      startDate = projectStartDate;
    }
    let dueDate = value.due_date;
    if (dueDate && projectStartDate && dueDate < projectStartDate) {
      dueDate = projectStartDate;
    }
    if (startDate && dueDate && dueDate < startDate) {
      dueDate = startDate;
    }
    onSubmit({ ...value, title: clean, start_date: startDate, due_date: dueDate });
    setTooBig([]);
  }

  return (
    <div className={`pick-add${editing ? " editing" : ""}`}
         /* Faylni to'g'ridan-to'g'ri shu qatorga sudrab tashlash ham mumkin */
         onDragOver={(e) => e.preventDefault()}
         onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
      <input
        value={value.title}
        /* Tahrirda maydon o'zi fokusga tushadi - odam nomni bosgan edi,
           demak birinchi tuzatadigan narsasi ham shu. */
        autoFocus={editing}
        placeholder={tx("team_picker.vazifa_masalan_login_sahifasini_yigish")}
        onChange={(e) => set({ title: e.target.value })}
        /* Enter forma yuborib yubormasin — u yerda vazifa qoshiladi.
           Escape esa tahrirni yopadi. */
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      {/* Ish oynasi: qachondan - qachongacha. Ikkalasi ham ixtiyoriy, lekin
          bir-birini cheklaydi - teskari oraliq tanlab bo'lmaydi. */}
      <div className="row wrap">
        <label className="pick-date">
          <small className="muted">{tx("common.boshlanish")}</small>
          <DateField
            value={value.start_date}
            min={projectStartDate || undefined}
            max={value.due_date || projectDueDate || undefined}
            onChange={(v) => {
              if (v && projectStartDate && v < projectStartDate) {
                v = projectStartDate;
              }
              if (v && value.due_date && value.due_date < v) {
                set({ start_date: v, due_date: v });
              } else {
                set({ start_date: v });
              }
            }}
          />
        </label>
        <label className="pick-date">
          <small className="muted">{tx("team_picker.tugash")}</small>
          <DateField
            value={value.due_date}
            min={value.start_date || projectStartDate || undefined}
            max={projectDueDate || undefined}
            onChange={(v) => {
              if (v && projectStartDate && v < projectStartDate) {
                v = projectStartDate;
              }
              if (v && value.start_date && v < value.start_date) {
                set({ due_date: value.start_date });
              } else {
                set({ due_date: v });
              }
            }}
          />
        </label>
      </div>

      <div className="row wrap">
        <select value={value.priority} style={{ flex: 1, minWidth: 110 }}
                onChange={(e) => set({ priority: Number(e.target.value) })}>
          {priorities.map((x) => (
            <option key={String(x.value)} value={String(x.value)}>{x.label}</option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" title={tx("team_picker.vazifaga_fayl_biriktirish")}
                onClick={() => fileInput.current?.click()}>
          <IconFile size={13} /> {tx("team_picker.fayl")}
        </button>
        {/* Yashirin: tugma bosilganda dasturiy ravishda ochiladi. `name`
            bo'lmasa brauzer uni nomsiz maydon deb ogohlantiradi. */}
        <input ref={fileInput} type="file" name="fayllar" multiple
               tabIndex={-1} aria-hidden="true" style={{ display: "none" }}
               onChange={(e) => addFiles(e.target.files)} />
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            {tx("common.bekor_qilish")}
          </button>
        )}
        <button type="button" className={`btn btn-sm${editing ? " btn-primary" : ""}`}
                disabled={!value.title.trim()} onClick={submit}>
          {editing
            ? <><IconCheck size={13} /> {tx("common.saqlash")}</>
            : <><IconPlus size={13} /> {tx("team_picker.qoshish")}</>}
        </button>
      </div>

      {!!value.files.length && (
        <div className="pick-files">
          {value.files.map((f, i) => (
            <span className="chip" key={`${f.name}-${f.size}-${i}`} title={f.name}>
              <IconFile size={11} />
              <span className="pick-file-name">{f.name}</span>
              <small className="muted">{fileSize(f.size)}</small>
              <button type="button" className="chip-x" title={tx("team_picker.faylni_olib_tashlash")}
                      onClick={() => set({ files: value.files.filter((_, n) => n !== i) })}>
                <IconClose size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!!tooBig.length && (
        <small className="err">
          {tx("team_picker.25_mb_dan_katta_bolgani")} {tooBig.join(", ")}
        </small>
      )}
    </div>
  );
}
