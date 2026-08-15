import type { Domain } from "../../shared/domain";

export const PapercutsDomain: Domain = () => Promise.resolve({
  config: (config) => {
    config.agent = {
      ...config.agent,
      title: {
        ...config.agent?.title,
        disable: true,
      },
    };

    return Promise.resolve();
  },
});
