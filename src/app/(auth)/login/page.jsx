import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDefaultRedirect } from "@/lib/auth";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Masuk — POS System",
};

export default async function LoginPage() {
  const session = await auth();

  // Already authenticated → redirect to role-specific page
  if (session?.user?.role) {
    redirect(getDefaultRedirect(session.user.role));
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">POS System</h1>
          <p className="mt-2 text-gray-600">Masuk ke akun Anda</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
