import { redirect } from "next/navigation";

// หน้าแรก -> ส่งไปหน้าขาย (POS) ซึ่งใช้บ่อยสุด
// AppShell จะเด้งไป /login ถ้ายังไม่ได้เข้าระบบ
export default function Home() {
  redirect("/pos");
}
