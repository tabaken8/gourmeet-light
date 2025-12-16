// src/app/auth/required/page.tsx
import LoginCard from "@/components/LoginCard";

export default async function RequiredPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = searchParams?.next ? decodeURIComponent(searchParams.next) : "/timeline";

  return (
    <LoginCard
      nextPath={nextPath}
      title="続けるにはログイン"
      description="この機能はログインすると使えるようになります。"
      showDiscoverLink
    />
  );
}
