"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, UserCog, Pencil, X, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/spinner";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { fetchEmployees, createEmployee, updateEmployee } from "@/lib/employees";
import type { EmployeeInput, Role, UserProfile } from "@/lib/types";

export default function EmployeesPage() {
  return (
    <OwnerOnly>
      <EmployeesContent />
    </OwnerOnly>
  );
}

function EmployeesContent() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchEmployees(user.store_id, user.id)
      .then(setEmployees)
      .catch((e) => notify(false, e.message))
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? employees.filter(
          (e) => e.full_name.includes(query.trim()) || e.username.includes(q)
        )
      : employees;
  }, [query, employees]);

  function notify(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSave(input: EmployeeInput) {
    if (!user) return;
    setBusy(true);
    try {
      const payload = { ...input, store_id: user.store_id, user_id: user.id };
      const saved = input.id
        ? await updateEmployee(payload)
        : await createEmployee(payload);
      setEmployees((prev) => {
        const exists = prev.some((e) => e.id === saved.id);
        return exists ? prev.map((e) => (e.id === saved.id ? saved : e)) : [...prev, saved];
      });
      setShowForm(false);
      notify(true, "บันทึกพนักงานสำเร็จ");
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleActive(emp: UserProfile) {
    if (!user) return;
    const turningOff = emp.is_active;
    if (turningOff && !confirm(`ยืนยันปิดใช้งาน "${emp.full_name}"?`)) return;
    setBusy(true);
    try {
      const saved = await updateEmployee({
        id: emp.id,
        store_id: user.store_id,
        user_id: user.id,
        full_name: emp.full_name,
        username: emp.username,
        role: emp.role,
        is_active: !emp.is_active,
      });
      setEmployees((prev) => prev.map((e) => (e.id === emp.id ? saved : e)));
      notify(true, turningOff ? "ปิดใช้งานแล้ว" : "เปิดใช้งานแล้ว");
    } catch (e) {
      notify(false, e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader
        title="พนักงาน"
        description="จัดการบัญชีพนักงานและสิทธิ์การใช้งาน"
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            <Plus className="h-5 w-5" /> เพิ่มพนักงาน
          </Button>
        }
      />

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

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="ค้นหาชื่อ หรือชื่อผู้ใช้..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-11"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="ไม่พบพนักงาน" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-muted-foreground">
                  <tr>
                    <th className="p-3">ชื่อ-นามสกุล</th>
                    <th className="p-3">ชื่อผู้ใช้</th>
                    <th className="p-3">บทบาท</th>
                    <th className="p-3">สถานะ</th>
                    <th className="p-3">เข้าระบบล่าสุด</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className={cn("border-b last:border-0", !u.is_active && "opacity-60")}>
                      <td className="p-3 font-medium">
                        <span className="flex items-center gap-2">
                          <UserCog className="h-4 w-4 text-muted-foreground" />
                          {u.full_name}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">@{u.username}</td>
                      <td className="p-3">
                        <Badge variant={u.role === "owner" ? "default" : "muted"}>
                          {u.role === "owner" ? "เจ้าของ" : "พนักงาน"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {u.is_active ? (
                          <Badge variant="success">เปิดใช้งาน</Badge>
                        ) : (
                          <Badge variant="destructive">ปิดใช้งาน</Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {u.last_login_at ? u.last_login_at : "-"}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="แก้ไข"
                            onClick={() => {
                              setEditing(u);
                              setShowForm(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {/* ห้ามปิดบัญชีตัวเอง / บัญชีเจ้าของ */}
                          {u.role !== "owner" && u.id !== user?.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => handleToggleActive(u)}
                            >
                              {u.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <EmployeeForm
          employee={editing}
          busy={busy}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function EmployeeForm({
  employee,
  busy,
  onClose,
  onSave,
}: {
  employee: UserProfile | null;
  busy: boolean;
  onClose: () => void;
  onSave: (e: EmployeeInput) => void;
}) {
  const isEdit = !!employee;
  const [fullName, setFullName] = useState(employee?.full_name ?? "");
  const [username, setUsername] = useState(employee?.username ?? "");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role>(employee?.role ?? "employee");
  const [err, setErr] = useState("");

  function submit() {
    if (!fullName.trim()) return setErr("กรุณากรอกชื่อ-นามสกุล");
    if (!username.trim()) return setErr("กรุณากรอกชื่อผู้ใช้");
    if (!isEdit && !/^\d{4,}$/.test(pin)) return setErr("PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก");
    if (isEdit && pin && !/^\d{4,}$/.test(pin)) return setErr("PIN ต้องเป็นตัวเลขอย่างน้อย 4 หลัก");
    setErr("");
    onSave({
      id: employee?.id,
      store_id: "",
      user_id: "",
      full_name: fullName.trim(),
      username: username.trim(),
      role,
      ...(pin ? { pin } : {}),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{isEdit ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="space-y-3">
            <Field label="ชื่อ-นามสกุล">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
            </Field>
            <Field label="ชื่อผู้ใช้ (สำหรับเข้าระบบ)">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEdit}
                placeholder="เช่น somchai"
              />
            </Field>
            <Field label={isEdit ? "PIN ใหม่ (เว้นว่าง = ไม่เปลี่ยน)" : "PIN (อย่างน้อย 4 หลัก)"}>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
              />
            </Field>
            <Field label="บทบาท">
              <div className="grid grid-cols-2 gap-2">
                {(["employee", "owner"] as Role[]).map((r) => (
                  <Button
                    key={r}
                    type="button"
                    variant={role === r ? "default" : "outline"}
                    onClick={() => setRole(r)}
                  >
                    {r === "owner" ? "เจ้าของ" : "พนักงาน"}
                  </Button>
                ))}
              </div>
            </Field>
          </div>

          {err && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {err}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              ยกเลิก
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
