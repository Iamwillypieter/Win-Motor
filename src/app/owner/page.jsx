import { redirect } from "next/navigation";

/**
 * /owner → redirect ke /owner/dashboard
 */
export default function OwnerIndexPage() {
  redirect("/owner/dashboard");
}
