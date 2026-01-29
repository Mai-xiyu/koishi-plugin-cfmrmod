import 'koishi';

declare module 'koishi' {
  interface Tables {
    cfmrmod_notify_group: {
      id: number;
      channelId: string;
      enabled: boolean;
    };
    cfmrmod_notify_sub: {
      id: number;
      channelId: string;
      platform: 'mr' | 'cf';
      projectId: string;
      lastVersion: string;
      lastNotifiedAt: Date;
    };
  }
}
