"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <p className="text-3xl">🏪</p>
          <h1 className="mt-2 text-2xl font-bold">ร้าน Gift</h1>
          <p className="text-sm text-muted-foreground">เข้าสู่ระบบเพื่อเริ่มขาย</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">ชื่อผู้ใช้</Label>
          <Input
            id="username"
            placeholder="เช่น gift หรือ somchai"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label>รหัส PIN</Label>
          {/* แสดงจุด PIN */}
          <div className="flex justify-center gap-3 py-2">
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-4 w-4 rounded-full border-2",
                  i < pin.length ? "border-primary bg-primary" : "border-input"
                )}
              />
            ))}
          </div>
        </div>

        {/* แป้นตัวเลขปุ่มใหญ่ */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button
              key={d}
              variant="outline"
              size="xl"
              onClick={() => pressDigit(d)}
              type="button"
            >
              {d}
            </Button>
          ))}
          <Button variant="ghost" size="xl" onClick={backspace} type="button">
            <Delete className="h-6 w-6" />
          </Button>
          <Button variant="outline" size="xl" onClick={() => pressDigit("0")} type="button">
            0
          </Button>
          <Button
            size="xl"
            onClick={handleSubmit}
            disabled={loading}
            type="button"
          >
            {loading ? "..." : "เข้า"}
          </Button>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        {isMockMode() && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            โหมดทดลอง: เจ้าของ <b>gift / 1111</b> · พนักงาน <b>somchai / 2222</b>
          </p>
        )}
      </Card>
    </div>
  );
}
