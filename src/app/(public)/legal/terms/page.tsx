// app/(public)/terms/page.tsx
export const metadata = {
  title: "利用規約 | Gourmeet",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed">
      <h1 className="mb-6 text-2xl font-bold">利用規約</h1>

      <p className="mb-4">
        本利用規約（以下、「本規約」）は、Gourmeet（以下、「本サービス」）の
        利用条件を定めるものです。ユーザーは、本規約に同意の上、本サービスを利用するものとします。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">第1条（適用）</h2>
      <p>
        本規約は、ユーザーと本サービスの運営者との間の、本サービスの利用に関わる
        一切の関係に適用されます。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">第2条（禁止事項）</h2>
      <p>
        ユーザーは、以下の行為をしてはなりません。
      </p>
      <ul className="list-disc pl-6">
        <li>法令または公序良俗に違反する行為</li>
        <li>本サービスの運営を妨害する行為</li>
        <li>不正アクセス、またはこれを試みる行為</li>
        <li>その他、運営者が不適切と判断する行為</li>
      </ul>

      <h2 className="mt-6 mb-2 font-semibold">第3条（サービスの提供）</h2>
      <p>
        本サービスは、事前の通知なく、内容の変更、停止、または終了することがあります。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">第4条（免責事項）</h2>
      <p>
        本サービスの利用により生じた損害について、運営者は一切の責任を負いません。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">第5条（規約の変更）</h2>
      <p>
        運営者は、必要と判断した場合には、本規約を変更することができるものとします。
      </p>
    </main>
  );
}
