import { api } from "./client";
import type { Task } from "./types";

export interface CreateSubtaskPayload {
  title: string;
  description?: string;
  priority?: number;
  task_type?: string;
  assignee_ids?: number[];
  due_date?: string | null;
  acceptance_criteria?: string;
  required_specialty?: string;
}

export async function createSubtask(taskId: number, payload: CreateSubtaskPayload): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/subtasks/`, payload);
}

export async function linkSubtask(taskId: number, subtaskId: number): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/link-subtask/`, { subtask_id: subtaskId });
}

export async function unlinkSubtask(taskId: number, subtaskId: number): Promise<Task> {
  return api.post<Task>(`/tasks/${taskId}/unlink-subtask/`, { subtask_id: subtaskId });
}

export async function getAvailableSubtasks(taskId: number, q?: string): Promise<Task[]> {
  return api.get<Task[]>(`/tasks/${taskId}/available-subtasks/`, q ? { q } : undefined);
}
