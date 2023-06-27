# vim: ft=make

doc:
  pnpm expand
  docker compose down || true
  docker compose up -d
  @pnpm expand watch
