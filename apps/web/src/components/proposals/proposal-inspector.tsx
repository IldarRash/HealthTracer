"use client";

import { useAuth } from "@clerk/nextjs";
import type { ProposalStatus } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProposals } from "../../lib/api";
import { ProposalCard } from "./proposal-card";

const statusFilters: Array<ProposalStatus | "all"> = [
  "all",
  "pending",
  "accepted",
  "rejected",
  "superseded",
];

export function ProposalInspector() {
  const { getToken } = useAuth();
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");

  const proposalsQuery = useQuery({
    queryKey: ["proposals"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listProposals(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? [];
    },
  });

  const filteredProposals = useMemo(() => {
    const proposals = proposalsQuery.data ?? [];
    if (statusFilter === "all") {
      return proposals;
    }

    return proposals.filter((proposal) => proposal.status === statusFilter);
  }, [proposalsQuery.data, statusFilter]);

  return (
    <div className="proposal-inspector">
      <div className="filter-row">
        <label htmlFor="proposal-status-filter">Status</label>
        <select
          id="proposal-status-filter"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as ProposalStatus | "all")
          }
        >
          {statusFilters.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {proposalsQuery.isLoading ? <p>Loading proposals…</p> : null}
      {proposalsQuery.isError ? (
        <p className="form-error" role="alert">
          {proposalsQuery.error instanceof Error
            ? proposalsQuery.error.message
            : "Proposals could not be loaded."}
        </p>
      ) : null}

      {!proposalsQuery.isLoading &&
      !proposalsQuery.isError &&
      filteredProposals.length === 0 ? (
        <p>No proposals match this filter yet.</p>
      ) : null}

      <div className="proposal-grid">
        {filteredProposals.map((proposal) => (
          <ProposalCard key={proposal.id} proposal={proposal} />
        ))}
      </div>
    </div>
  );
}
