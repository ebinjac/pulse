// @ts-nocheck
import * as __fd_glob_25 from "../content/docs/guides/working-with-alerts.mdx?collection=docs"
import * as __fd_glob_24 from "../content/docs/guides/viewing-runs-and-history.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/guides/testing-and-publishing-monitors.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/guides/running-deployment-validation.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/guides/notification-settings.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/guides/managing-secrets.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/guides/managing-applications.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/guides/importing-monitors.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/guides/creating-a-monitor.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/guides/configuring-elf-queries.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/guides/certificate-profiles.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/getting-started/your-first-monitor.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/getting-started/what-is-rythm.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/getting-started/navigating-the-console.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/concepts/secrets-and-certificates.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/concepts/monitors-and-runs.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/concepts/glossary.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/concepts/elf-log-checks.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/concepts/deployment-validation.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/concepts/applications.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/concepts/alerts.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/guides/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/concepts/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/getting-started/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "getting-started/meta.json": __fd_glob_1, "concepts/meta.json": __fd_glob_2, "guides/meta.json": __fd_glob_3, }, {"index.mdx": __fd_glob_4, "concepts/alerts.mdx": __fd_glob_5, "concepts/applications.mdx": __fd_glob_6, "concepts/deployment-validation.mdx": __fd_glob_7, "concepts/elf-log-checks.mdx": __fd_glob_8, "concepts/glossary.mdx": __fd_glob_9, "concepts/monitors-and-runs.mdx": __fd_glob_10, "concepts/secrets-and-certificates.mdx": __fd_glob_11, "getting-started/navigating-the-console.mdx": __fd_glob_12, "getting-started/what-is-rythm.mdx": __fd_glob_13, "getting-started/your-first-monitor.mdx": __fd_glob_14, "guides/certificate-profiles.mdx": __fd_glob_15, "guides/configuring-elf-queries.mdx": __fd_glob_16, "guides/creating-a-monitor.mdx": __fd_glob_17, "guides/importing-monitors.mdx": __fd_glob_18, "guides/managing-applications.mdx": __fd_glob_19, "guides/managing-secrets.mdx": __fd_glob_20, "guides/notification-settings.mdx": __fd_glob_21, "guides/running-deployment-validation.mdx": __fd_glob_22, "guides/testing-and-publishing-monitors.mdx": __fd_glob_23, "guides/viewing-runs-and-history.mdx": __fd_glob_24, "guides/working-with-alerts.mdx": __fd_glob_25, });