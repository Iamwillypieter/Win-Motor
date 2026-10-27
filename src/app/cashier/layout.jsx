import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Navbar from "@/components/shared/Navbar";
import OrderReadyNotification from "@/components/cashier/OrderReadyNotification";

export default async function CashierLayout({ children }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "CASHIER") {
    redirect("/403");
  }

  const navLinks = [
    { href: "/cashier", label: "POS" },
    { href: "/cashier/orders", label: "Pesanan Aktif" },
  ];

  return (
    <>
      <Navbar
        userName={session.user.name}
        role="CASHIER"
        links={navLinks}
      />
      {children}
      <OrderReadyNotification />
    </>
  );
}
