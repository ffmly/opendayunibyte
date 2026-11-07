import { redirect } from "next/navigation";

export default function DisabledCatsAdminPage() {
  redirect("/admin/workshops");
}
