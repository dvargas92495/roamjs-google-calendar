import {
  localStorageGet,
  localStorageRemove,
  localStorageSet,
  getPageUidByPageTitle,
  createBlock,
} from "roam-client";
import { getOauth } from "roamjs-components";
import differenceInSeconds from "date-fns/differenceInSeconds";
import axios from 'axios';

export const getAccessToken = (label?: string) => {
  const legacyOauth = getOauth("google-calendar");
  const isLegacy = legacyOauth && legacyOauth !== "{}";
  const oauth = isLegacy ? legacyOauth : getOauth("google", label);
  if (oauth !== "{}") {
    const { access_token, expires_in, refresh_token, node } = JSON.parse(oauth);
    const { time, uid: oauthUid } = node || {};
    const tokenAge = differenceInSeconds(
      new Date(),
      time ? new Date(time) : new Date(0)
    );
    return tokenAge > expires_in
      ? axios
          .post(`https://lambda.roamjs.com/google-auth`, {
            refresh_token,
            grant_type: "refresh_token",
          })
          .then((r) => {
            const storageData = localStorageGet(
              isLegacy ? "oauth-google-calendar" : "oauth-google"
            );
            const data = JSON.stringify({ refresh_token, ...r.data });
            if (storageData) {
              if (isLegacy) {
                localStorageRemove("oauth-google-calendar");
              }
              localStorageSet(
                "oauth-google",
                JSON.stringify(
                  JSON.parse(storageData).map(
                    (at: { uid: string; text: string }) =>
                      at.uid === oauthUid
                        ? {
                            uid: at.uid,
                            data,
                            time: new Date().valueOf(),
                            text: at.text,
                          }
                        : at
                  )
                )
              );
            } else {
              window.roamAlphaAPI.updateBlock({
                block: {
                  uid: oauthUid,
                  string: data,
                },
              });
              if (isLegacy) {
                const parentUid = getPageUidByPageTitle("roam/js/google");
                const uid = createBlock({
                  parentUid,
                  node: { text: "oauth" },
                });
                window.roamAlphaAPI.moveBlock({
                  location: { "parent-uid": uid, order: 0 },
                  block: { uid: oauthUid },
                });
              }
            }
            return r.data.access_token;
          })
      : Promise.resolve(access_token);
  } else {
    return Promise.resolve("");
  }
};
