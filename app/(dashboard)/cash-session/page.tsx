"use client";

import { useEffect, useState } from "react";
import { Wallet, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingBlock } from "@/components/ui/spinner";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { formatTHB, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  getCurrentSession,
  openCashSession,
  closeCashSession,
  type CloseSessionResult,
} from "@/lib/cash";
import type { CashSession } from "@/lib/types";

export default function CashSessionPage() {
  return (
    <OwnerOnly>
      <CashSessionContent />
    </OwnerOnly>
  );
}

function CashSessionContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CashSession | null>(null);
  const [closed, setClosed] = useState<CloseSessionResult | null>(null);
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getCurrentSession(user.store_id)
      .then(setSession)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [user]);

  async function handleOpen() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const s = await openCashSession(user.store_id, user.id, Number(openingCash || 0));
      setSession(s);
      setClosed(null);
      setOpeningCash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เปิดกะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    if (!user || !session) return;
    setBusy(true);
    setError(null);
    try {
      const result = await closeCashSession(
        user.store_id,
        user.id,
        session.id,
        Number(actualCash || 0)
      );
      setClosed(result);
      setSession(null);
      setActualCash("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ปิดกะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="กะเงินสด"
        description="เปิด-ปิดกะ และตรวจเงินสดในลิ้นชัก (เจ้าของเท่านั้น)"
      />

      <div className="mx-auto max-w-md">
        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {error}
          </p>
        )}

        {/* ไม่มีกะเปิด -> เปิดกะ (และโชว์สรุปกะที่เพิ่งปิด ถ้ามี) */}
        {!session && (
          <>
            {closed && (
              <Card className="mb-4">
                <CardHeader>
                  <CardTitle>สรุปกะ (ปิดแล้ว)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Row label="เงินที่ควรมี" value={formatTHB(closed.expected_cash)} />
                  <Row label="นับได้จริง" value={formatTHB(closed.actual_cash)} />
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-3 text-lg font-bold",
                      closed.difference === 0
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    )}
                  >
                    <span>ส่วนต่าง</span>
                    <span>
                      {closed.difference > 0 ? "+" : ""}
                      {formatTHB(closed.difference)}
                    </span>
                  </div>
                  {closed.difference !== 0 && (
                    <p className="text-center text-sm text-destructive">
                      {closed.difference < 0 ? "เงินขาด — ตรวจสอบ" : "เงินเกิน — ตรวจสอบ"}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" /> เปิดกะใหม่
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>เงินทอนตั้งต้น (บาท)</Label>
                  <Input
                    type="number"
                    placeholder="เช่น 1000"
                    value={openingCash}
                    onChange={(e) => setOpeningCash(e.target.value)}
                    className="h-12 text-lg"
                  />
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleOpen}
                  disabled={busy || !openingCash}
                >
                  {busy ? "กำลังเปิด..." : "เปิดกะ"}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* กะเปิดอยู่ -> ปิดกะ */}
        {session && (
          <Card>
            <CardHeader>
              <CardTitle>กะที่เปิดอยู่</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="เปิดเมื่อ" value={formatDateTime(session.opened_at)} />
              <Row label="เงินทอนตั้งต้น" value={formatTHB(session.opening_cash)} />
              <Row
                label="เงินที่ควรมี (คาดการณ์)"
                value={formatTHB(session.expected_cash)}
                strong
              />
              <div className="space-y-1.5 pt-2">
                <Label>นับเงินจริงในลิ้นชัก (บาท)</Label>
                <Input
                  type="number"
                  placeholder="เช่น 4100"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="h-12 text-lg"
                />
              </div>
              <Button
                className="w-full"
                size="lg"
                variant="destructive"
                onClick={handleClose}
                disabled={busy || !actualCash}
              >
                <Lock className="h-5 w-5" />
                {busy ? "กำลังปิด..." : "ปิดกะ"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
