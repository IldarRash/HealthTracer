import type { UpdateCurrentUserInput, User } from "@health/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { toUser } from "./user.mapper.js";
import { UsersRepository } from "./users.repository.js";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async resolveFromAuth(auth: ClerkAuthContext): Promise<User> {
    const user = await this.usersRepository.upsertFromAuth(auth);

    return toUser(user);
  }

  async updateCurrentUser(
    auth: ClerkAuthContext,
    input: UpdateCurrentUserInput,
  ): Promise<User> {
    const currentUser = await this.resolveFromAuth(auth);
    const updated = await this.usersRepository.update(currentUser.id, input);

    if (!updated) {
      throw new NotFoundException("User not found.");
    }

    return toUser(updated);
  }
}
