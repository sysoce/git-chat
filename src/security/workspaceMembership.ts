import type { WorkspaceMember, WorkspaceMembersConfig, MembershipPolicy } from '../types/chat';

export class WorkspaceMembership {
  public static readonly DEFAULT_POLICY: MembershipPolicy = 'open';

  /**
   * Initializes a default members configuration for a workspace.
   */
  public static createDefaultConfig(
    workspaceId: string,
    initialAdmin: { id: string; gitUsername: string; name: string },
    policy: MembershipPolicy = 'open'
  ): WorkspaceMembersConfig {
    return {
      workspaceId,
      membershipPolicy: policy,
      updatedAt: Date.now(),
      members: [
        {
          id: initialAdmin.id,
          gitUsername: initialAdmin.gitUsername,
          name: initialAdmin.name,
          role: 'admin',
          storageRepo: `${initialAdmin.gitUsername}/git-chat-media`,
          storageVolumes: [`${initialAdmin.gitUsername}/git-chat-media`],
          joinedAt: Date.now(),
        },
      ],
    };
  }

  /**
   * Parses and validates a members.json file content.
   */
  public static parseConfig(jsonContent: string): WorkspaceMembersConfig {
    try {
      const data = JSON.parse(jsonContent);
      return {
        workspaceId: data.workspaceId || 'workspace_default',
        membershipPolicy: data.membershipPolicy === 'invite_only' ? 'invite_only' : 'open',
        updatedAt: data.updatedAt || Date.now(),
        members: Array.isArray(data.members) ? data.members : [],
      };
    } catch {
      return {
        workspaceId: 'workspace_default',
        membershipPolicy: 'open',
        updatedAt: Date.now(),
        members: [],
      };
    }
  }

  /**
   * Checks if an author is allowed to post based on the workspace membership policy.
   * In 'open' mode (Free Use), any user is allowed.
   * In 'invite_only' mode (Enterprise Strict), user must be present in the roster.
   */
  public static isAuthorAllowed(
    authorId: string,
    config?: WorkspaceMembersConfig | null
  ): boolean {
    if (!config || config.membershipPolicy === 'open') {
      return true; // Free Open Use: No barriers
    }

    // Enterprise Strict: Must be in roster
    return config.members.some((m) => m.id === authorId || m.gitUsername === authorId);
  }

  /**
   * Checks if a user has admin privileges to modify workspace or roster files.
   */
  public static isUserAdmin(
    userId: string,
    config?: WorkspaceMembersConfig | null
  ): boolean {
    if (!config || config.members.length === 0) {
      return true; // If no roster yet, first user has admin authority
    }
    const member = config.members.find((m) => m.id === userId || m.gitUsername === userId);
    return member?.role === 'admin';
  }

  /**
   * Adds or updates a member in the roster.
   */
  public static upsertMember(
    config: WorkspaceMembersConfig,
    member: Partial<WorkspaceMember> & { id: string; gitUsername: string }
  ): WorkspaceMembersConfig {
    const existingIndex = config.members.findIndex(
      (m) => m.id === member.id || m.gitUsername === member.gitUsername
    );

    const updatedMembers = [...config.members];
    const defaultStorage = `${member.gitUsername}/git-chat-media`;

    const newMember: WorkspaceMember = {
      id: member.id,
      gitUsername: member.gitUsername,
      name: member.name || member.gitUsername,
      role: member.role || (config.members.length === 0 ? 'admin' : 'member'),
      storageRepo: member.storageRepo || defaultStorage,
      storageVolumes: member.storageVolumes || [member.storageRepo || defaultStorage],
      joinedAt: member.joinedAt || Date.now(),
    };

    if (existingIndex >= 0) {
      updatedMembers[existingIndex] = { ...updatedMembers[existingIndex]!, ...newMember };
    } else {
      updatedMembers.push(newMember);
    }

    return {
      ...config,
      members: updatedMembers,
      updatedAt: Date.now(),
    };
  }

  /**
   * Removes a member from the roster.
   */
  public static removeMember(
    config: WorkspaceMembersConfig,
    userIdOrGitUsername: string
  ): WorkspaceMembersConfig {
    return {
      ...config,
      members: config.members.filter(
        (m) => m.id !== userIdOrGitUsername && m.gitUsername !== userIdOrGitUsername
      ),
      updatedAt: Date.now(),
    };
  }

  /**
   * Encodes a 1-click workspace invitation payload into a URL-safe hash.
   */
  public static createInviteHash(options: {
    workspaceId: string;
    repo: string;
    branch?: string;
    provider?: 'github' | 'gita' | 'gitlab';
    policy?: MembershipPolicy;
    salt?: string;
  }): string {
    const payload = {
      w: options.workspaceId,
      r: options.repo,
      b: options.branch || 'git-chat',
      p: options.provider || 'github',
      pol: options.policy || 'open',
      s: options.salt || '',
    };
    const json = JSON.stringify(payload);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(json).toString('base64url');
    }
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Parses and decodes a 1-click workspace invitation URL hash.
   */
  public static parseInviteHash(hash: string): {
    workspaceId: string;
    repo: string;
    branch: string;
    provider: 'github' | 'gita' | 'gitlab';
    policy: MembershipPolicy;
    salt?: string;
  } | null {
    try {
      let clean = hash.replace(/^[#?]/, '').replace(/^(invite|setup)=/, '');
      clean = clean.replace(/-/g, '+').replace(/_/g, '/');
      while (clean.length % 4 !== 0) clean += '=';

      const json = typeof Buffer !== 'undefined'
        ? Buffer.from(clean, 'base64').toString('utf8')
        : atob(clean);

      const p = JSON.parse(json);
      if (!p.r) return null;

      return {
        workspaceId: p.w || 'workspace_default',
        repo: p.r,
        branch: p.b || 'git-chat',
        provider: p.p || 'github',
        policy: p.pol === 'invite_only' ? 'invite_only' : 'open',
        salt: p.s || undefined,
      };
    } catch {
      return null;
    }
  }
}
