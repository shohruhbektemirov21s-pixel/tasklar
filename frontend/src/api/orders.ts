/**
 * Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ / Change Requests) API xizmati.
 */
import { api } from "./client";
import type { ChangeRequestItem, OrderAttachmentItem, OrderStats } from "./types";

export interface PaginatedResponse<T> {
  count: number;
  next?: string | null;
  previous?: string | null;
  results: T[];
}

export interface OrderFilters {
  page?: number;
  page_size?: number;
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
  pm_start_date?: string;
  pm_deadline?: string;
  pm_notes?: string;
  assigned_pm?: number | null;
  assigned_developer?: number | null;
  executor_signer?: string;
}

/**
 * Buyurtmalar ro'yxatini server-side filter va pagination bilan olish.
 */
export async function getOrders(filters: OrderFilters = {}): Promise<PaginatedResponse<ChangeRequestItem>> {
  const params: Record<string, string | number> = {};
  if (filters.page) params.page = filters.page;
  if (filters.page_size) params.page_size = filters.page_size;
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
  pm_start_date?: string;
  pm_deadline?: string;
  pm_notes?: string;
  assigned_pm?: number | null;
  assigned_developer?: number | null;
}

/**
 * PM buyurtmani o'z zimmasiga olishi (Claim) va muddat/vaqtini belgilash.
 */
export async function claimOrder(id: number | string, data?: ClaimOrderPayload): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/claim-order/`, data || {});
}

/**
 * PM buyurtmani o'zidan yechishi (unclaim) va yangi holatiga qaytarishi.
 */
export async function unclaimOrder(id: number | string, reason?: string): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/unclaim-order/`, { reason });
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
export async function clientReject(
  id: number | string,
  payload: string | { feedback_note?: string; file?: File | null; is_new_tz?: boolean }
): Promise<ChangeRequestItem> {
  if (typeof payload === "string") {
    return api.post<ChangeRequestItem>(`/orders/${id}/client-reject-completion/`, {
      feedback_note: payload.trim(),
    });
  }
  const formData = new FormData();
  if (payload.feedback_note) {
    formData.append("feedback_note", payload.feedback_note.trim());
  }
  if (payload.file) {
    formData.append("feedback_file", payload.file);
  }
  if (payload.is_new_tz) {
    formData.append("is_new_tz", "true");
  }
  return api.post<ChangeRequestItem>(`/orders/${id}/client-reject-completion/`, formData);
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
    pm_start_date?: string;
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
 * Buyurtma (TZ) asosida yangi vazifa (Task) yaratish va biriktirish.
 */
export async function createOrderTask(
  orderId: number | string,
  payload: {
    title: string;
    description?: string;
    priority?: number;
    task_type?: string;
    due_date?: string;
    assignee_ids?: number[];
    assignee_id?: number;
  }
): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${orderId}/create-task/`, payload);
}

/**
 * Buyurtmaning rasmiy Word (.docx) blankini yuklab olish.
 */
export async function downloadOrderDocx(id: number | string, requestNo: string): Promise<void> {
  await api.download(`/orders/${id}/export-docx/`, `Buyurtma_${requestNo}.docx`);
}

/**
 * Buyurtmani boshqa PM ga topshirish (o'tkazish).
 */
export async function reassignPm(
  id: number | string,
  payload: {
    assigned_pm: number;
    notes?: string;
  }
): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/reassign-pm/`, payload);
}

