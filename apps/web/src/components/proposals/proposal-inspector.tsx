"use client";

import { useAuth } from "@clerk/nextjs";
import type { ProposalStatus } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProposals } from "../../lib/api";
import { EmptyState, ErrorState, LoadingState } from "../ui";
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

  if (proposalsQuery.isLoading) {
    return <LoadingState title="Loading proposals…" />;
  }

  if (proposalsQuery.isError) {
    return (
      <ErrorState
        title="Proposals unavailable"
        description={
          proposalsQuery.error instanceof Error
            ? proposalsQuery.error.message
            : "Proposals could not be loaded."
        }
      />
    );
  }

  return (
    <div className="proposal-inspector">
      <div className="proposal-inspector__filter filter-row">
        <label htmlFor="proposal-status-filter">Filter by status</label>
        <select
          id="proposal-status-filter"
          className="training-schedule-input"
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as ProposalStatus | "all")
          }
        >
          {statusFilters.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "All statuses" : status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {!proposalsQuery.isLoading && filteredProposals.length === 0 ? (
        <EmptyState
          title="No proposals"
          description={
            statusFilter === "all"
              ? "No proposals have been created yet. Start a chat to generate AI coaching proposals."
              : `No proposals with status "${statusFilter}" found.`
          }
        />
      ) : (
        <div className="proposal-grid">
          {filteredProposals.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}
