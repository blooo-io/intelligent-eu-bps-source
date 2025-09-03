import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedRequest, AuthClaims } from "./auth.types.js";

export type AuthGuardOptions = {
  /** Roles allowed to call the route (Keycloak realm/client roles). */
  roles: string[];
  /** When true, the token communityId must match the :communityId route param. */
  requireCommunityScope?: boolean;
};

/**
 * NestJS guard that re-checks role and community scope on every request (REQ-010).
 * Token validation itself is done at the edge (APISIX); modules never trust the gateway alone.
 */
@Injectable()
export class ModuleAuthGuard implements CanActivate {
  constructor(private readonly options: AuthGuardOptions) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & { params?: Record<string, string> }
    >();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("Missing authenticated principal");
    }
    assertHasRole(user, this.options.roles);
    if (this.options.requireCommunityScope) {
      assertCommunityScope(user, request.params?.communityId);
    }
    return true;
  }
}

export function assertHasRole(user: AuthClaims, roles: string[]): void {
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new ForbiddenException("Insufficient role");
  }
}

export function assertCommunityScope(
  user: AuthClaims,
  communityId: string | undefined,
): void {
  if (!communityId) {
    throw new ForbiddenException("Missing community scope");
  }
  if (user.tokenUse === "service") {
    return;
  }
  if (user.communityId !== communityId) {
    throw new ForbiddenException("Community scope mismatch");
  }
}
