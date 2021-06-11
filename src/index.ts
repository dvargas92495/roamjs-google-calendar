import { toConfig, createPage } from "roam-client";

const CONFIG = toConfig("google-calendar");
createPage({ title: CONFIG });
