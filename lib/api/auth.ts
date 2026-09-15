import { api } from "./client";
import type { LoginRequest, LoginResponse } from "@/lib/types/api";

export function login(req: LoginRequest) {
  return api.post<LoginResponse>("/auth/login", req);
}
