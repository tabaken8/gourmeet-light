import ProfileYearStats from "@/components/ProfileYearStats";

export default async function ProfileStatsBlock({ userId }: { userId: string }) {
  return <ProfileYearStats userId={userId} scope="me" />;
}
