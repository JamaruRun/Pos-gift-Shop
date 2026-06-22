"use client";

import { useEffect, useState } from "react";
import { Send, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { getLineSettings, saveLineSettings, sendTestLine } from "@/lib/settings";
import type { LineSettings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <OwnerOnly>
      <SettingsContent />
    </OwnerOnly>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const [s, setS] = useState<LineSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    getLineSettings(user.store_id, user.id)
      .then(setS)
      .catch((e) => notify(false, e.message))
      .finally(() => setLoading(false));
  }, [user]);

  function notify(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  function set<K extends keyof LineSettings>(key: K, val: LineSettings[K]) {
    setS((prev) => (prev ? { ...prev, [key]: val } : prev));
  }

  async function handleSave() {
    if (!user || !s) return;
    setBusy(true);
    try {
      const saved = await saveLineSettings(user.store_id, user.id, s);
      setS(saved);
      notify(true, "บันทึกการตั้งค่าสำเร็จ");
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    if (!user || !s) return;
    setTesting(true);
    try {
      const r = await sendTestLine(user.store_id, user.id, s.line_owner_user_id);
      notify(true, r.message);
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "ส่งข้อความทดสอบไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  }

  if (loading || !s) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="ตั้งค่า" description="ข้อมูลร้านและการแจ้งเตือน LINE" />

      {toast && (
        <p
          className={cn(
            "mb-4 rounded-lg px-3 py-2 text-sm",
            toast.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          )}
        >
          {toast.msg}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ข้อมูลร้าน (placeholder) */}
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลร้าน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>ชื่อร้าน</Label>
              <Input value="ร้าน Gift" disabled />
            </div>
            <p className="text-sm text-muted-foreground">
              * แก้ไขข้อมูลร้านจะเพิ่มในเวอร์ชันถัดไป (placeholder)
            </p>
          </CardContent>
        </Card>

        {/* LINE Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>การแจ้งเตือน LINE</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>LINE Owner User ID</Label>
              <Input
                placeholder="Uxxxxxxxxxxxxxxxx"
                value={s.line_owner_user_id}
                onChange={(e) => set("line_owner_user_id", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                userId ของเจ้าของร้าน (ปลายทางรับแจ้งเตือน) — Channel Access Token เก็บฝั่ง server เท่านั้น
              </p>
            </div>

            <div className="space-y-2">
              <Toggle
                label="แจ้งเตือนเมื่อมีการขาย 🛒"
                checked={s.line_notify_sale_enabled}
                onChange={(v) => set("line_notify_sale_enabled", v)}
              />
              <Toggle
                label="แจ้งเตือนเมื่อยกเลิกบิล ⚠️"
                checked={s.line_notify_void_enabled}
                onChange={(v) => set("line_notify_void_enabled", v)}
              />
              <Toggle
                label="แจ้งเตือนเมื่อปิดกะ 📊"
                checked={s.line_notify_cash_close_enabled}
                onChange={(v) => set("line_notify_cash_close_enabled", v)}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={busy}>
                <Save className="h-5 w-5" />
                {busy ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                <Send className="h-5 w-5" />
                {testing ? "กำลังส่ง..." : "ส่งข้อความทดสอบ"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-accent/50"
    >
      <span>{label}</span>
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      </span>
    </button>
  );
}
