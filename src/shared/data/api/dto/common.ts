export interface ApiResponse<T = unknown> {
  status: number;
  code: number;
  msg: string;
  data: T;
}
