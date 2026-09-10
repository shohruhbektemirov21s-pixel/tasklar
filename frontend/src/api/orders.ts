/**
 * Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ / Change Requests) API xizmati.
 */
import { api } from "./client";
import type { ChangeRequestItem, OrderAttachmentItem, OrderStats } from "./types";
import { tx } from "@/i18n";

export const ORDER_TYPE_CONFIG: Record<
  string,
  { label: string; icon: string; bg: string; color: string; border: string; desc: string }
> = {
  NEW: {
    get label() { return tx("orders.yangi_loyiha"); },
    icon: "🚀",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#059669",
    border: "rgba(16, 185, 129, 0.3)",
    desc: "Noldan boshlanadigan yangi dasturiy ta'minot yoki axborot tizimi",
  },
  CONTINUATION: {
    get label() { return tx("orders.davom_ettiriladigan"); },
    icon: "🔄",
    bg: "rgba(37, 99, 235, 0.12)",
    color: "#2563eb",
    border: "rgba(37, 99, 235, 0.3)",
    desc: "Mavjud tizimni davom ettirish / navbatdagi bosqich",
  },
  NEEDS_CLASSIFICATION: {
    get label() { return tx("orders.turlash_kerak"); },
    icon: "🏷️",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#d97706",
    border: "rgba(217, 119, 6, 0.3)",
    desc: "Boshqarma taklifi / PM tomonidan tahlil va turlash talab etiladi",
  },
  MODERNIZATION: {
    get label() { return tx("orders.modernizatsiya"); },
    icon: "⚡",
    bg: "rgba(139, 92, 246, 0.12)",
    color: "#7c3aed",
    border: "rgba(139, 92, 246, 0.3)",
    desc: "Amaldagi funksionallikni kengaytirish va yangilash",
  },
  MAINTENANCE: {
    get label() { return tx("orders.texnik_xizmat"); },
    icon: "🛠️",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.3)",
    desc: "Xatoliklarni tuzatish va tizimni qo'llab-quvvatlash",
  },
};

export const ORDER_STATUS_CONFIG: Record<
  ChangeRequestItem["status"],
  {
    label: string;
    icon: string;
    bg: string;
    color: string;
    border: string;
    badgeClass: string;
    desc: string;
    step: number;
  }
> = {
  DRAFT: {
    get label() { return tx("orders.status_draft"); },
    icon: "📝",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.35)",
    badgeClass: "badge-ghost",
    desc: "Talabnoma qoralama sifatida saqlangan, hali yuborilmagan",
    step: 0,
  },
  NEW: {
    label: "Yangi (Yuborilgan)",
    icon: "📝",
    bg: "rgba(234, 179, 8, 0.12)",
    color: "#b45309",
    border: "rgba(234, 179, 8, 0.35)",
    badgeClass: "badge-warning",
    desc: "Talabnoma boshqarma tomonidan yuborilgan, PM ko'rib chiqishi kutilmoqda",
    step: 1,
  },
  ACCEPTED: {
    label: "Qabul qilindi",
    icon: "📋",
    bg: "rgba(59, 130, 246, 0.12)",
    color: "#1d4ed8",
    border: "rgba(59, 130, 246, 0.35)",
    badgeClass: "badge-brand",
    desc: "Loyiha menejeri (PM) talabnomani qabul qildi va o'rganmoqda",
    step: 2,
  },
  ASSIGNED_TO_DEV: {
    label: "Dasturchiga topshirildi",
    icon: "💻",
    bg: "rgba(99, 102, 241, 0.14)",
    color: "#4338ca",
    border: "rgba(99, 102, 241, 0.38)",
    badgeClass: "badge-brand",
    desc: "Vazifa dasturchiga topshirildi va amaliy ijroga biriktirildi",
    step: 3,
  },
  IN_PROGRESS: {
    label: "Jarayonda",
    icon: "⚙️",
    bg: "rgba(14, 165, 233, 0.12)",
    color: "#0369a1",
    border: "rgba(14, 165, 233, 0.35)",
    badgeClass: "badge-brand",
    desc: "Dasturchi va jamoa amaliy ish olib bormoqda / kod yozilmoqda",
    step: 4,
  },
  TESTING: {
    label: "Test qilinmoqda",
    icon: "🧪",
    bg: "rgba(217, 119, 6, 0.12)",
    color: "#c2410c",
    border: "rgba(217, 119, 6, 0.35)",
    badgeClass: "badge-warning",
    desc: "O'zgartirish testdan o'tkazilmoqda va buyurtmachi sinoviga tayyorlanmoqda",
    step: 5,
  },
  READY_FOR_REVIEW: {
    label: "Boshqarma tasdig'ida",
    icon: "📑",
    bg: "rgba(168, 85, 247, 0.12)",
    color: "#7e22ce",
    border: "rgba(168, 85, 247, 0.35)",
    badgeClass: "badge-brand",
    desc: "PM ishni yakunladi va hisobot topshirildi",
    step: 6,
  },
  COMPLETED: {
    label: "Bajarildi (Tasdiqlangan)",
    icon: "✅",
    bg: "rgba(16, 185, 129, 0.12)",
    color: "#047857",
    border: "rgba(16, 185, 129, 0.35)",
    badgeClass: "badge-ok",
    desc: "Ish muvaffaqiyatli yakunlandi va boshqarma tomonidan tasdiqlandi",
    step: 7,
  },
  REJECTED: {
    label: "Rad etildi",
    icon: "❌",
    bg: "rgba(239, 68, 68, 0.12)",
    color: "#b91c1c",
    border: "rgba(239, 68, 68, 0.35)",
    badgeClass: "badge-danger",
    desc: "Talabnoma asosli sabablarga ko'ra rad etildi",
    step: -1,
  },
  CANCELLED: {
    label: "Bekor qilingan (Atmen)",
    icon: "🚫",
    bg: "rgba(100, 116, 139, 0.12)",
    color: "#475569",
    border: "rgba(100, 116, 139, 0.35)",
    badgeClass: "badge-ghost",
    desc: "Yangi versiya tasdiqlangani sababli ushbu eski TZ bekor qilingan (atmen)",
    step: -2,
  },
};


export interface PaginatedResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface OrderFilters {
  page?: number;
  search?: string;
  project?: number | string;
  status?: string;
  deadline?: string;
  priority?: string;
  order_type?: string;
}

export interface PMDecisionPayload {
  status: ChangeRequestItem["status"];
  pm_estimated_duration?: string;
  pm_deadline?: string;
  pm_notes?: string;
  assigned_developer?: number | null;
  executor_signer?: string;
}

/**
 * Buyurtmalar ro'yxatini server-side filter va pagination bilan olish.
 */
export async function getOrders(filters: OrderFilters = {}): Promise<PaginatedResponse<ChangeRequestItem>> {
  const params: Record<string, string | number> = {};
  if (filters.page) params.page = filters.page;
  if (filters.search?.trim()) params.search = filters.search.trim();
  if (filters.project) params.project = filters.project;
  if (filters.status) params.status = filters.status;
  if (filters.deadline) params.deadline = filters.deadline;
  if (filters.priority) params.priority = filters.priority;
  if (filters.order_type) params.order_type = filters.order_type;

  return api.get<PaginatedResponse<ChangeRequestItem>>("/orders/", params);
}

/**
 * Buyurtmalar statistik ko'rsatkichlarini olish (KPI).
 */
export async function getOrderStats(): Promise<OrderStats> {
  return api.get<OrderStats>("/orders/stats/");
}

/**
 * Bitta buyurtma tafsilotlarini olish.
 */
export async function getOrder(id: number | string): Promise<ChangeRequestItem> {
  return api.get<ChangeRequestItem>(`/orders/${id}/`);
}

export interface ClaimOrderPayload {
  pm_estimated_duration?: string;
  pm_deadline?: string;
  pm_notes?: string;
  assigned_developer?: number | null;
}

/**
 * PM buyurtmani o'z zimmasiga olishi (Claim) va muddat/vaqtini belgilash.
 */
export async function claimOrder(id: number | string, data?: ClaimOrderPayload): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/claim-order/`, data || {});
}

/**
 * PM qarorini va muddatlarini belgilash.
 */
export async function setPmDecision(id: number | string, data: PMDecisionPayload): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/set-pm-decision/`, data);
}

/**
 * PM tomonidan tugatilgan ish hisobotini topshirish.
 */
export async function submitCompletion(id: number | string, formData: FormData): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/submit-completion/`, formData);
}

/**
 * Boshqarma tomonidan ishni qabul qilish va tasdiqlash.
 */
export async function clientApprove(id: number | string): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/client-approve/`, {});
}

/**
 * Boshqarma tomonidan kamchilik / xatolik bilan qaytarish.
 */
export async function clientReject(id: number | string, feedbackNote: string): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/client-reject-completion/`, {
    feedback_note: feedbackNote.trim(),
  });
}

/**
 * Buyurtmaga qo'shimcha fayllar biriktirish.
 */
export async function addOrderAttachments(
  id: number | string,
  formData: FormData
): Promise<OrderAttachmentItem[]> {
  return api.post<OrderAttachmentItem[]>(`/orders/${id}/attachments/`, formData);
}

/**
 * Buyurtmaga biriktirilgan faylni o'chirish.
 */
export async function deleteOrderAttachment(
  orderId: number | string,
  attachmentId: number | string
): Promise<void> {
  return api.delete<void>(`/orders/${orderId}/attachments/${attachmentId}/`);
}

/**
 * Buyurtmani o'chirish (Faqat DRAFT holatda).
 */
export async function deleteOrder(id: number | string): Promise<void> {
  return api.delete<void>(`/orders/${id}/`);
}

/**
 * Qoralama holatidagi buyurtmani rasman yuborish.
 */
export async function sendOrder(id: number | string): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/send/`, {});
}

/**
 * Boshqarma yangi versiya (TZ) yuklashi.
 */
export async function uploadVersion(id: number | string, formData: FormData): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/upload-version/`, formData);
}

/**
 * PM yangi versiyani tasdiqlashi (eski versiya atmen bo'ladi, yangi TZ ga o'tkaziladi).
 */
export async function approveVersion(
  id: number | string,
  payload: {
    version?: number;
    decision_note?: string;
    pm_estimated_duration?: string;
    pm_deadline?: string;
    assigned_developer?: number | null;
    status?: string;
  }
): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/approve-version/`, payload);
}

/**
 * PM yangi versiyani rad etishi (eski TZ o'z kuchida qoladi).
 */
export async function rejectVersion(
  id: number | string,
  payload: {
    version?: number;
    decision_note: string;
  }
): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/reject-version/`, payload);
}

/**
 * Buyurtmaning rasmiy Word (.docx) blankini yuklab olish.
 */
export async function downloadOrderDocx(id: number | string, requestNo: string): Promise<void> {
  const token = localStorage.getItem("tf_access");
  const res = await fetch(`/api/orders/${id}/export-docx/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Word faylini yuklab bo'lmadi");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Buyurtma_${requestNo}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
