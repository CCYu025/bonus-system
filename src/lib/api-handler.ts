import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";

export function withErrorHandling<T>(fn: () => Promise<T>) {
  return fn().then(
    (data) => NextResponse.json(data),
    (err: unknown) => {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "系統錯誤" }, { status: 500 });
    }
  );
}
