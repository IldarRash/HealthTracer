import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const profilesServiceSource = readFileSync(
  join(import.meta.dirname, "../profiles/profiles.service.ts"),
  "utf8",
);
const goalsServiceSource = readFileSync(
  join(import.meta.dirname, "../goals/goals.service.ts"),
  "utf8",
);
const userStateServiceSource = readFileSync(
  join(import.meta.dirname, "../user-state/user-state.service.ts"),
  "utf8",
);
const usersModuleSource = readFileSync(
  join(import.meta.dirname, "./users.module.ts"),
  "utf8",
);

describe("users/profiles/goals module dependency shape", () => {
  it("avoids injecting UsersService into ProfilesService or GoalsService", () => {
    expect(profilesServiceSource).not.toContain("UsersService");
    expect(profilesServiceSource).toContain("UsersRepository");
    expect(goalsServiceSource).not.toContain("UsersService");
    expect(goalsServiceSource).toContain("UsersRepository");
  });

  it("keeps read orchestration in UserStateService instead of UsersService", () => {
    expect(userStateServiceSource).toContain("ProfilesService");
    expect(userStateServiceSource).toContain("GoalsService");
  });

  it("does not create a users module import cycle", () => {
    expect(usersModuleSource).not.toContain("ProfilesModule");
    expect(usersModuleSource).not.toContain("GoalsModule");
    expect(usersModuleSource).not.toContain("forwardRef");
  });
});
