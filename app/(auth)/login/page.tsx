"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth, defaultRouteFor } from "@/lib/auth-context";
import { isMockMode } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const PIN_LENGTH = 4;

  // ถ้าเข้าระบบอยู่แล้ว -> เด้งไปหน้าตาม role (owner: แดชบอร์ด, พนักงาน: ขายของ)
  useEffect(() => {
    if (!authLoading && user) {
      router.replace(defaultRouteFor(user));
    }
  }, [authLoading, user, router]);

  function pressDigit(d: string) {
    setError("");
    setPin((prev) => (prev.length >= PIN_LENGTH ? prev : prev + d));
  }
  function backspace() {
    setPin((prev) => prev.slice(0, -1));
  }

  async function handleSubmit() {
    if (!username.trim()) {
      setError("กรุณากรอกชื่อผู้ใช้");
      return;
    }
    if (pin.length < PIN_LENGTH) {
      setError("กรุณากรอก PIN ให้ครบ");
      return;
    }
    setLoading(true);
    try {
      const profile = await signIn(username, pin);
      router.replace(defaultRouteFor(profile));
    } catch (e) {
      setError(e instanceof Error ? e.message : "เข้าสู่ระบบไม่สำเร็จ");
      setPin("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* พื้นหลังไล่เฉด + แสง */}
      <div className="absolute inset-0 gradient-primary" />
      <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-black/10 blur-3xl" />

      <div className="relative w-full max-w-sm">
        {/* แบรนด์ */}
        <div className="mb-6 text-center text-white">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-4xl shadow-lg backdrop-blur">
            🏪
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">ร้าน Gift</h1>
          <p className="mt-1 text-sm text-white/80">ระบบขายหน้าร้าน + จัดการสต็อก</p>
        </div>

        <Card className="glass border-white/40 p-6 shadow-2xl">
          <div className="space-y-2">
            <Label htmlFor="username">ชื่อผู้ใช้</Label>
            <Input
              id="username"
              placeholder="เช่น gift หรือ somchai"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="h-12 bg-white/80"
            />
          </div>

          <div className="mt-4 space-y-2">
            <Label>รหัส PIN</Label>
            <div className="flex justify-center gap-3 py-2">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-3.5 w-3.5 rounded-full border-2 transition-all",
                    i < pin.length
                      ? "scale-110 border-primary bg-primary"
                      : "border-muted-foreground/30"
                  )}
                />
              ))}
            </div>
          </div>

          {/* แป้นตัวเลข */}
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressDigit(d)}
                className="h-14 rounded-2xl bg-white/70 text-xl font-semibold text-foreground shadow-sm transition-all hover:bg-white active:scale-95"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={backspace}
              className="flex h-14 items-center justify-center rounded-2xl text-muted-foreground transition-all hover:bg-white/50 active:scale-95"
            >
              <Delete className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => pressDigit("0")}
              className="h-14 rounded-2xl bg-white/70 text-xl font-semibold text-foreground shadow-sm transition-all hover:bg-white active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="gradient-primary flex h-14 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md transition-all hover:opacity-95 active:scale-95 disabled:opacity-60"
            >
              {loading ? "..." : "เข้า"}
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          {isMockMode() && (
            <p className="mt-4 rounded-xl bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
              โหมดทดลอง: เจ้าของ <b>gift / 1111</b> · พนักงาน <b>somchai / 2222</b>
            </p>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-white/70">
          ใช้งานง่าย · ปลอดภัย · ดูยอดขายแบบเรียลไทม์
        </p>
      </div>
    </div>
  );
}
