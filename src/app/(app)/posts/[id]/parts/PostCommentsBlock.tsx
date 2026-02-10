import PostComments from "@/components/PostComments";

export default async function PostCommentsBlock({
  postId,
  postUserId,
  meId,
}: {
  postId: string;
  postUserId: string;
  meId: string | null;
}) {
  // ここは “表示を遅らせる” だけ。ロジックは PostComments 側に任せる
  return <PostComments postId={postId} postUserId={postUserId} meId={meId} />;
}
