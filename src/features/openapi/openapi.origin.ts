// Where the API this document describes answers, where its code lives and where people read its
// reference. The servers entry is relative, so the document points at whichever host serves it:
// npm run dev, wrangler dev or a deploy of your own.

const REPOSITORY_URL = "https://github.com/thiagocajadev/simulador-reforma-tributaria-core";

const API_ORIGIN = {
  serverUrl: "/",
  contactUrl: REPOSITORY_URL,
  reference: { description: "README, in Portuguese", url: `${REPOSITORY_URL}#readme` },
};

export { API_ORIGIN };
