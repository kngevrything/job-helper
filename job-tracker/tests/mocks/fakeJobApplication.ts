// A minimal in-memory stand-in for the Mongoose JobApplication model,
// covering exactly the query shapes used by the app's API routes
// (find().sort().lean(), findOne(), create(), findById().lean(),
// findByIdAndUpdate().lean()). Not a general Mongoose emulator.

type Doc = Record<string, any>;

let docs: Doc[] = [];
let autoIncrement = 1;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function nextId(): string {
  return String(autoIncrement++).padStart(24, "0");
}

export function resetJobApplications(seed: Doc[] = []) {
  autoIncrement = 1;
  docs = seed.map((d) => ({
    _id: d._id ?? nextId(),
    createdAt: d.createdAt ?? new Date(),
    updatedAt: d.updatedAt ?? new Date(),
    endedAt: d.endedAt ?? null,
    notes: d.notes ?? "",
    folderPath: d.folderPath ?? null,
    resumePath: d.resumePath ?? null,
    coverLetterPath: d.coverLetterPath ?? null,
    ...d,
  }));
}

export function getAllDocsRaw() {
  return docs;
}

function matches(doc: Doc, query: Doc): boolean {
  return Object.entries(query).every(([key, value]) => doc[key] === value);
}

function findQueryChain(getResults: () => Doc[]) {
  const chain: any = {
    sort(spec: Record<string, 1 | -1>) {
      return findQueryChain(() => {
        const [[key, dir]] = Object.entries(spec);
        return [...getResults()].sort((a, b) => {
          if (a[key] < b[key]) return -1 * dir;
          if (a[key] > b[key]) return 1 * dir;
          return 0;
        });
      });
    },
    lean() {
      return Promise.resolve(clone(getResults()));
    },
    then(resolve: any, reject: any) {
      return Promise.resolve(clone(getResults())).then(resolve, reject);
    },
  };
  return chain;
}

function singleQueryChain(getResult: () => Doc | null) {
  return {
    lean() {
      return Promise.resolve(getResult() ? clone(getResult()) : null);
    },
    then(resolve: any, reject: any) {
      return Promise.resolve(getResult() ? clone(getResult()) : null).then(resolve, reject);
    },
  };
}

export const JobApplication = {
  find(query: Doc = {}) {
    return findQueryChain(() => docs.filter((d) => matches(d, query)));
  },

  findOne(query: Doc = {}) {
    const found = docs.find((d) => matches(d, query)) ?? null;
    return Promise.resolve(found ? clone(found) : null);
  },

  findById(id: string) {
    return singleQueryChain(() => docs.find((d) => d._id === id) ?? null);
  },

  async create(data: Doc) {
    // Emulate the unique compound index on {company, jobId}.
    const dup = docs.find((d) => d.company === data.company && d.jobId === data.jobId);
    if (dup) {
      const err: any = new Error("E11000 duplicate key error collection");
      err.code = 11000;
      throw err;
    }

    const doc: Doc = {
      _id: nextId(),
      status: "UNSET",
      notes: "",
      endedAt: null,
      folderPath: null,
      resumePath: null,
      coverLetterPath: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    };
    docs.push(doc);
    return clone(doc);
  },

  findByIdAndUpdate(id: string, update: Doc, _opts?: Doc) {
    const apply = () => {
      const idx = docs.findIndex((d) => d._id === id);
      if (idx === -1) return null;
      docs[idx] = { ...docs[idx], ...update, updatedAt: new Date() };
      return docs[idx];
    };
    return singleQueryChain(apply);
  },
};
