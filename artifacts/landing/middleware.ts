export const config = {
  matcher: ["/"],
};

export default function middleware(request: Request): Response {
  const cookies = request.headers.get("cookie") ?? "";
  const alreadyAssigned = /ab-variant=/.test(cookies);

  if (alreadyAssigned) {
    return new Response(null, { status: 200 });
  }

  const variant = Math.random() < 0.5 ? "control" : "treatment";

  return new Response(null, {
    status: 200,
    headers: {
      "Set-Cookie": `ab-variant=${variant}; Path=/; Max-Age=2592000; SameSite=Lax`,
    },
  });
}
