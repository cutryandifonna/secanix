export function GET() {
  return new Response("ok", {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
