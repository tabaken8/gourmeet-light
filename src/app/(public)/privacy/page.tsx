// app/(public)/privacy/page.tsx
export const metadata = {
  title: "プライバシーポリシー | Gourmeet",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed">
      <h1 className="mb-6 text-2xl font-bold">プライバシーポリシー</h1>

      <p className="mb-4">
        Gourmeet（以下、「本サービス」）は、ユーザーの個人情報を以下の方針に基づき適切に取り扱います。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">1. 取得する情報</h2>
      <p>
        本サービスでは、Google認証を利用する際に、Googleアカウントに登録されたメールアドレス、
        プロフィール情報（表示名、プロフィール画像）を取得します。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">2. 利用目的</h2>
      <p>
        取得した情報は、ユーザー認証、アカウント管理、および本サービスの提供・改善のためにのみ利用します。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">3. 第三者提供</h2>
      <p>
        本サービスでは、認証およびデータ管理のためにSupabaseを利用しています。
        取得した情報は、これらのサービスを通じて適切に管理されます。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">4. 個人情報の管理</h2>
      <p>
        取得した個人情報は、不正アクセス、紛失、漏洩等を防止するため、適切な安全対策を講じます。
      </p>

      <h2 className="mt-6 mb-2 font-semibold">5. お問い合わせ</h2>
      <p>
        個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。<br />
        Email: contact@gourmeet.jp
      </p>
    </main>
  );
}
