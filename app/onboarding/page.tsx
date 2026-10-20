import { redirect } from "next/navigation";
import { getAuthUser, getProfile } from "@/lib/auth";
import { JoinForm } from "./JoinForm";

export default async function OnboardingPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (await getProfile(user.id)) redirect("/");

  return (
    <main className="center">
      <div className="card">
        <h2>Join {process.env.GROUP_NAME ?? "the group"}</h2>
        <p className="muted">Signed in as {user.email}</p>
        <JoinForm />
      </div>
    </main>
  );
}
