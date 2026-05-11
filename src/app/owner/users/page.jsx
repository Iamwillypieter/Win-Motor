import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import UserManagement from "@/components/owner/UserManagement";

export const metadata = {
  title: "Manajemen Karyawan — Owner",
};

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "OWNER") {
    redirect("/403");
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <UserManagement currentUserId={session.user.id} />
      </div>
    </main>
  );
}
