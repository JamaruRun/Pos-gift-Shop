"use client";

import { useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { OwnerOnly } from "@/components/OwnerOnly";
import { PageHeader } from "@/components/layout/PageHeader";
import { mockEmployees } from "@/lib/mock";
import type { UserProfile } from "@/lib/types";

export default function EmployeesPage() {
  return (
    <OwnerOnly>
      <EmployeesContent />
    </OwnerOnly>
  );
}

function EmployeesContent() {
  const [employees, setEmployees] = useState<UserProfile[]>(mockEmployees);

  function toggleActive(id: string) {
    // TODO: supabase.from('users').update({ is_active }).eq('id', id) (owner เท่านั้น)
    setEmployees((prev) =>
      prev.map((u) => (u.id === id ? { ...u, is_active: !u.is_active } : u))
    );
  }

  return (
    <div>
      <PageHeader
        title="พนักงาน"
        description="จัดการบัญชีพนักงานและสิทธิ์การใช้งาน"
        action={
          <Button
            onClick={() => alert("เพิ่มพนักงาน — จะเชื่อมกับ backend ภายหลัง (placeholder)")}
          >
            <Plus className="h-5 w-5" /> เพิ่มพนักงาน
          </Button>
        }
      />

      {employees.length === 0 ? (
        <EmptyState title="ยังไม่มีพนักงาน" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {employees.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <UserCog className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="font-medium">{u.full_name}</p>
                      <p className="text-sm text-muted-foreground">@{u.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={u.role === "owner" ? "default" : "muted"}>
                      {u.role === "owner" ? "เจ้าของ" : "พนักงาน"}
                    </Badge>
                    {u.is_active ? (
                      <Badge variant="success">ใช้งานอยู่</Badge>
                    ) : (
                      <Badge variant="destructive">ปิดใช้งาน</Badge>
                    )}
                    {/* เจ้าของปิด/เปิดใช้งานพนักงานได้ (ไม่ให้แตะบัญชี owner) */}
                    {u.role !== "owner" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(u.id)}
                      >
                        {u.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        * การเพิ่มพนักงานและตั้ง PIN จะเชื่อมกับ Supabase Auth / RPC ในขั้นถัดไป (placeholder)
      </p>
    </div>
  );
}
