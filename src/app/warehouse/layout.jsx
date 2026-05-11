import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Navbar from "@/components/shared/Navbar";

export default async function WarehouseLayout({ children }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "WAREHOUSE") {
    redirect("/403");
  }

  const navLinks = [
    { href: "/warehouse/queue", label: "Antrean" },
    { href: "/warehouse/inventory", label: "Inventori" },
  ];

  return (
    <>
      <Navbar
        userName={session.user.name}
        role="WAREHOUSE"
        links={navLinks}
      />
      {children}
    </>
  );
}
