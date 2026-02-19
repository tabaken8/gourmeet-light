// src/app/auth/required/page.tsx
import LoginCard from "@/components/LoginCard";

export default async function RequiredPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = searchParams?.next
    ? decodeURIComponent(searchParams.next)
    : "/search";

  return (
    <LoginCard
      nextPath={nextPath}
      title="続けるにはログイン"
      description="この機能はログインすると使えるようになります。"
      showDiscoverLink
      searchHref="/search"
      exploreMode="fixed"
      exploreFixedText="ログインなしでまずは覗く"
      pitchTitle="店選びを、最短で正解に。"
      pitchSubtitle="Gourmeetは、友だち/知り合いの“リアルなおすすめ”で店を選べるアプリです。"
      pitchItems={[
        { icon: "friends", title: "知ってる人のおすすめが見える", body: "匿名レビューより信頼できる情報が集まる。" },
        { icon: "bookmark", title: "コレクションで保存が資産になる", body: "行きたい店が増えるほど、店選びがラクになる。" },
        { icon: "map", title: "地図で近くの候補を即決", body: "“どこ行く？”が秒速で決まる。" },
        { icon: "trust", title: "小さなコミュニティほど強い", body: "身内の当たり店が積み上がっていく。" },
      ]}
      pitchNote="無料・数秒で開始。ログイン後は元の画面に戻ります。"
    />
  );
}
