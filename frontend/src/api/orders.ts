/**
 * Axborot tizimiga o'zgartirish kiritish buyurtmalari (TZ / Change Requests) API xizmati.
 */
import { api } from "./client";
import type { ChangeRequestItem, OrderStats } from "./types";

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

/**
 * PM buyurtmani o'z zimmasiga olishi (Claim).
 */
export async function claimOrder(id: number | string): Promise<ChangeRequestItem> {
  return api.post<ChangeRequestItem>(`/orders/${id}/claim-order/`, {});
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
 * Buyurtmani o'chirish (Faqat NEW holatda).
 */
export async function deleteOrder(id: number | string): Promise<void> {
  return api.delete<void>(`/orders/${id}/`);
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

