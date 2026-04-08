// src/app/auth/required/page.tsx
import LoginCard from "@/components/LoginCard";
import { getTranslations } from "next-intl/server";

export default async function RequiredPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const t = await getTranslations("auth");
  const sp = searchParams ? await searchParams : undefined;
  const nextPath = sp?.next
    ? decodeURIComponent(sp.next)
    : "/search";

  return (
    <LoginCard
      nextPath={nextPath}
      title={t("loginRequired")}
      description={t("loginRequiredDesc")}
      showDiscoverLink
      searchHref="/search"
      exploreMode="fixed"
      exploreFixedText={t("browseWithoutLogin")}
      pitchTitle={t("pitchTitle")}
      pitchSubtitle={t("pitchSubtitle")}
      pitchItems={[
        { icon: "friends", title: t("pitchFriends"), body: t("pitchFriendsBody") },
        { icon: "bookmark", title: t("pitchCollection"), body: t("pitchCollectionBody") },
        { icon: "map", title: t("pitchMap"), body: t("pitchMapBody") },
        { icon: "trust", title: t("pitchCommunity"), body: t("pitchCommunityBody") },
      ]}
      pitchNote={t("pitchNote")}
    />
  );
}
