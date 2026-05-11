import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Navbar from "@/components/shared/Navbar";
import TransactionNotification from "@/components/owner/TransactionNotification";

export default async function OwnerLayout({ children }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "OWNER") {
    redirect("/403");
  }

  const navLinks = [
    { href: "/owner/dashboard", label: "Dashboard" },
    { href: "/owner/products", label: "Produk" },
    { href: "/owner/users", label: "Karyawan" },
  ];

  return (
    <>
      <Navbar
        userName={session.user.name}
        role="OWNER"
        links={navLinks}
      />
      {children}
      <TransactionNotification />
    </>
  );
}
