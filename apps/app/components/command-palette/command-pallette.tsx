import React, { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/router";

import useSWR, { mutate } from "swr";

// icons
import { InboxIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { DiscordIcon, GithubIcon, SettingIcon } from "components/icons";
// headless ui
import { Dialog, Transition } from "@headlessui/react";
// cmdk
import { Command } from "cmdk";
// hooks
import useProjectDetails from "hooks/use-project-details";
import useTheme from "hooks/use-theme";
import useToast from "hooks/use-toast";
import useUser from "hooks/use-user";
import useDebounce from "hooks/use-debounce";
// components
import {
  ShortcutsModal,
  ChangeIssueState,
  ChangeIssuePriority,
  ChangeIssueAssignee,
  ChangeInterfaceTheme,
} from "components/command-palette";
import { BulkDeleteIssuesModal } from "components/core";
import { CreateUpdateCycleModal } from "components/cycles";
import { CreateUpdateIssueModal, DeleteIssueModal } from "components/issues";
import { CreateUpdateModuleModal } from "components/modules";
import { CreateProjectModal } from "components/project";
import { CreateUpdateViewModal } from "components/views";
import { CreateUpdatePageModal } from "components/pages";

import { Icon, Loader, ToggleSwitch, Tooltip } from "components/ui";
// helpers
import { copyTextToClipboard } from "helpers/string.helper";
// services
import issuesService from "services/issues.service";
import workspaceService from "services/workspace.service";
import inboxService from "services/inbox.service";
// types
import {
  IIssue,
  IWorkspaceDefaultSearchResult,
  IWorkspaceIssueSearchResult,
  IWorkspaceProjectSearchResult,
  IWorkspaceSearchResult,
  IWorkspaceSearchResults,
} from "types";
// fetch keys
import { INBOX_LIST, ISSUE_DETAILS, PROJECT_ISSUES_ACTIVITY } from "constants/fetch-keys";

const commandGroups: {
  [key: string]: {
    icon: string;
    itemName: (item: any) => React.ReactNode;
    path: (item: any) => string;
    title: string;
  };
} = {
  cycle: {
    icon: "contrast",
    itemName: (cycle: IWorkspaceDefaultSearchResult) => (
      <h6>
        <span className="text-custom-text-200 text-xs">{cycle.project__identifier}</span>
        {"- "}
        {cycle.name}
      </h6>
    ),
    path: (cycle: IWorkspaceDefaultSearchResult) =>
      `/${cycle?.workspace__slug}/projects/${cycle?.project_id}/cycles/${cycle?.id}`,
    title: "Cycles",
  },
  issue: {
    icon: "stack",
    itemName: (issue: IWorkspaceIssueSearchResult) => (
      <h6>
        <span className="text-custom-text-200 text-xs">{issue.project__identifier}</span>
        {"- "}
        {issue.name}
      </h6>
    ),
    path: (issue: IWorkspaceIssueSearchResult) =>
      `/${issue?.workspace__slug}/projects/${issue?.project_id}/issues/${issue?.id}`,
    title: "Issues",
  },
  issue_view: {
    icon: "photo_filter",
    itemName: (view: IWorkspaceDefaultSearchResult) => (
      <h6>
        <span className="text-custom-text-200 text-xs">{view.project__identifier}</span>
        {"- "}
        {view.name}
      </h6>
    ),
    path: (view: IWorkspaceDefaultSearchResult) =>
      `/${view?.workspace__slug}/projects/${view?.project_id}/views/${view?.id}`,
    title: "Views",
  },
  module: {
    icon: "dataset",
    itemName: (module: IWorkspaceDefaultSearchResult) => (
      <h6>
        <span className="text-custom-text-200 text-xs">{module.project__identifier}</span>
        {"- "}
        {module.name}
      </h6>
    ),
    path: (module: IWorkspaceDefaultSearchResult) =>
      `/${module?.workspace__slug}/projects/${module?.project_id}/modules/${module?.id}`,
    title: "Modules",
  },
  page: {
    icon: "article",
    itemName: (page: IWorkspaceDefaultSearchResult) => (
      <h6>
        <span className="text-custom-text-200 text-xs">{page.project__identifier}</span>
        {"- "}
        {page.name}
      </h6>
    ),
    path: (page: IWorkspaceDefaultSearchResult) =>
      `/${page?.workspace__slug}/projects/${page?.project_id}/pages/${page?.id}`,
    title: "Pages",
  },
  project: {
    icon: "work",
    itemName: (project: IWorkspaceProjectSearchResult) => project?.name,
    path: (project: IWorkspaceProjectSearchResult) =>
      `/${project?.workspace__slug}/projects/${project?.id}/issues/`,
    title: "Projects",
  },
  workspace: {
    icon: "grid_view",
    itemName: (workspace: IWorkspaceSearchResult) => workspace?.name,
    path: (workspace: IWorkspaceSearchResult) => `/${workspace?.slug}/`,
    title: "Workspaces",
  },
};

export const CommandPalette: React.FC = () => {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [isCreateCycleModalOpen, setIsCreateCycleModalOpen] = useState(false);
  const [isCreateViewModalOpen, setIsCreateViewModalOpen] = useState(false);
  const [isCreateModuleModalOpen, setIsCreateModuleModalOpen] = useState(false);
  const [isBulkDeleteIssuesModalOpen, setIsBulkDeleteIssuesModalOpen] = useState(false);
  const [deleteIssueModal, setDeleteIssueModal] = useState(false);
  const [isCreateUpdatePageModalOpen, setIsCreateUpdatePageModalOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<IWorkspaceSearchResults>({
    results: {
      workspace: [],
      project: [],
      issue: [],
      cycle: [],
      module: [],
      issue_view: [],
      page: [],
    },
  });
  const [resultsCount, setResultsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);
  const [placeholder, setPlaceholder] = React.useState("Type a command or search...");
  const [pages, setPages] = useState<string[]>([]);
  const page = pages[pages.length - 1];

  const [isWorkspaceLevel, setIsWorkspaceLevel] = useState(false);

  const router = useRouter();
  const { workspaceSlug, projectId, issueId, inboxId } = router.query;

  const { user } = useUser();
  const { projectDetails } = useProjectDetails();

  const { setToastAlert } = useToast();
  const { toggleCollapsed } = useTheme();

  const { data: issueDetails } = useSWR(
    workspaceSlug && projectId && issueId ? ISSUE_DETAILS(issueId as string) : null,
    workspaceSlug && projectId && issueId
      ? () =>
          issuesService.retrieve(workspaceSlug as string, projectId as string, issueId as string)
      : null
  );

  const { data: inboxList } = useSWR(
    workspaceSlug && projectId ? INBOX_LIST(projectId as string) : null,
    workspaceSlug && projectId
      ? () => inboxService.getInboxes(workspaceSlug as string, projectId as string)
      : null
  );

  const updateIssue = useCallback(
    async (formData: Partial<IIssue>) => {
      if (!workspaceSlug || !projectId || !issueId) return;

      mutate<IIssue>(
        ISSUE_DETAILS(issueId as string),

        (prevData) => {
          if (!prevData) return prevData;

          return {
            ...prevData,
            ...formData,
          };
        },
        false
      );

      const payload = { ...formData };
      await issuesService
        .patchIssue(workspaceSlug as string, projectId as string, issueId as string, payload, user)
        .then(() => {
          mutate(PROJECT_ISSUES_ACTIVITY(issueId as string));
          mutate(ISSUE_DETAILS(issueId as string));
        })
        .catch((e) => {
          console.error(e);
        });
    },
    [workspaceSlug, issueId, projectId, user]
  );

  const handleIssueAssignees = (assignee: string) => {
    if (!issueDetails) return;

    setIsPaletteOpen(false);
    const updatedAssignees = issueDetails.assignees ?? [];

    if (updatedAssignees.includes(assignee)) {
      updatedAssignees.splice(updatedAssignees.indexOf(assignee), 1);
    } else {
      updatedAssignees.push(assignee);
    }
    updateIssue({ assignees_list: updatedAssignees });
  };

  const copyIssueUrlToClipboard = useCallback(() => {
    if (!router.query.issueId) return;

    const url = new URL(window.location.href);
    copyTextToClipboard(url.href)
      .then(() => {
        setToastAlert({
          type: "success",
          title: "Copied to clipboard",
        });
      })
      .catch(() => {
        setToastAlert({
          type: "error",
          title: "Some error occurred",
        });
      });
  }, [router, setToastAlert]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const singleShortcutKeys = ["p", "v", "d", "h", "q", "m"];
      const { key, ctrlKey, metaKey, altKey, shiftKey } = e;
      if (!key) return;
      const keyPressed = key.toLowerCase();
      if (
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target as Element).classList?.contains("remirror-editor")
      ) {
        if ((ctrlKey || metaKey) && keyPressed === "k") {
          e.preventDefault();
          setIsPaletteOpen(true);
        } else if ((ctrlKey || metaKey) && keyPressed === "c") {
          if (altKey) {
            e.preventDefault();
            copyIssueUrlToClipboard();
          }
        } else if (keyPressed === "c") {
          e.preventDefault();
          setIsIssueModalOpen(true);
        } else if ((ctrlKey || metaKey) && keyPressed === "b") {
          e.preventDefault();
          toggleCollapsed();
        } else if (key === "Delete") {
          e.preventDefault();
          setIsBulkDeleteIssuesModalOpen(true);
        } else if (
          singleShortcutKeys.includes(keyPressed) &&
          (ctrlKey || metaKey || altKey || shiftKey)
        ) {
          e.preventDefault();
        } else if (keyPressed === "p") {
          setIsProjectModalOpen(true);
        } else if (keyPressed === "v") {
          setIsCreateViewModalOpen(true);
        } else if (keyPressed === "d") {
          setIsCreateUpdatePageModalOpen(true);
        } else if (keyPressed === "h") {
          setIsShortcutsModalOpen(true);
        } else if (keyPressed === "q") {
          setIsCreateCycleModalOpen(true);
        } else if (keyPressed === "m") {
          setIsCreateModuleModalOpen(true);
        }
      }
    },
    [toggleCollapsed, copyIssueUrlToClipboard]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(
    () => {
      if (!workspaceSlug) return;

      setIsLoading(true);

      if (debouncedSearchTerm) {
        setIsSearching(true);
        workspaceService
          .searchWorkspace(workspaceSlug as string, {
            ...(projectId ? { project_id: projectId.toString() } : {}),
            search: debouncedSearchTerm,
            workspace_search: !projectId ? true : isWorkspaceLevel,
          })
          .then((results) => {
            setResults(results);
            const count = Object.keys(results.results).reduce(
              (accumulator, key) => (results.results as any)[key].length + accumulator,
              0
            );
            setResultsCount(count);
          })
          .finally(() => {
            setIsLoading(false);
            setIsSearching(false);
          });
      } else {
        setResults({
          results: {
            workspace: [],
            project: [],
            issue: [],
            cycle: [],
            module: [],
            issue_view: [],
            page: [],
          },
        });
        setIsLoading(false);
        setIsSearching(false);
      }
    },
    [debouncedSearchTerm, isWorkspaceLevel, projectId, workspaceSlug] // Only call effect if debounced search term changes
  );

  if (!user) return null;

  const createNewWorkspace = () => {
    setIsPaletteOpen(false);
    router.push("/create-workspace");
  };

  const createNewProject = () => {
    setIsPaletteOpen(false);
    setIsProjectModalOpen(true);
  };

  const createNewIssue = () => {
    setIsPaletteOpen(false);
    setIsIssueModalOpen(true);
  };

  const createNewCycle = () => {
    setIsPaletteOpen(false);
    setIsCreateCycleModalOpen(true);
  };

  const createNewView = () => {
    setIsPaletteOpen(false);
    setIsCreateViewModalOpen(true);
  };

  const createNewPage = () => {
    setIsPaletteOpen(false);
    setIsCreateUpdatePageModalOpen(true);
  };

  const createNewModule = () => {
    setIsPaletteOpen(false);
    setIsCreateModuleModalOpen(true);
  };

  const deleteIssue = () => {
    setIsPaletteOpen(false);
    setDeleteIssueModal(true);
  };

  const redirect = (path: string) => {
    setIsPaletteOpen(false);
    router.push(path);
  };

  return (
    <>
      <ShortcutsModal isOpen={isShortcutsModalOpen} setIsOpen={setIsShortcutsModalOpen} />
      {workspaceSlug && (
        <CreateProjectModal
          isOpen={isProjectModalOpen}
          setIsOpen={setIsProjectModalOpen}
          user={user}
        />
      )}
      {projectId && (
        <>
          <CreateUpdateCycleModal
            isOpen={isCreateCycleModalOpen}
            handleClose={() => setIsCreateCycleModalOpen(false)}
            user={user}
          />
          <CreateUpdateModuleModal
            isOpen={isCreateModuleModalOpen}
            setIsOpen={setIsCreateModuleModalOpen}
            user={user}
          />
          <CreateUpdateViewModal
            handleClose={() => setIsCreateViewModalOpen(false)}
            isOpen={isCreateViewModalOpen}
            user={user}
          />
          <CreateUpdatePageModal
            isOpen={isCreateUpdatePageModalOpen}
            handleClose={() => setIsCreateUpdatePageModalOpen(false)}
            user={user}
          />
        </>
      )}
      {issueId && issueDetails && (
        <DeleteIssueModal
          handleClose={() => setDeleteIssueModal(false)}
          isOpen={deleteIssueModal}
          data={issueDetails}
          user={user}
        />
      )}
      <CreateUpdateIssueModal
        isOpen={isIssueModalOpen}
        handleClose={() => setIsIssueModalOpen(false)}
        fieldsToShow={inboxId ? ["name", "description", "priority"] : ["all"]}
      />
      <BulkDeleteIssuesModal
        isOpen={isBulkDeleteIssuesModalOpen}
        setIsOpen={setIsBulkDeleteIssuesModalOpen}
        user={user}
      />
      <Transition.Root
        show={isPaletteOpen}
        afterLeave={() => {
          setSearchTerm("");
        }}
        as={React.Fragment}
      >
        <Dialog as="div" className="relative z-30" onClose={() => setIsPaletteOpen(false)}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-custom-backdrop bg-opacity-50 transition-opacity" />
          </Transition.Child>

          <div className="fixed inset-0 z-30 overflow-y-auto p-4 sm:p-6 md:p-20">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative mx-auto max-w-2xl transform divide-y divide-custom-border-200 divide-opacity-10 rounded-xl border border-custom-border-200 bg-custom-background-100 shadow-2xl transition-all">
                <Command
                  filter={(value, search) => {
                    if (value.toLowerCase().includes(search.toLowerCase())) return 1;
                    return 0;
                  }}
                  onKeyDown={(e) => {
                    // when search is empty and page is undefined
                    // when user tries to close the modal with esc
                    if (e.key === "Escape" && !page && !searchTerm) {
                      setIsPaletteOpen(false);
                    }
                    // Escape goes to previous page
                    // Backspace goes to previous page when search is empty
                    if (e.key === "Escape" || (e.key === "Backspace" && !searchTerm)) {
                      e.preventDefault();
                      setPages((pages) => pages.slice(0, -1));
                      setPlaceholder("Type a command or search...");
                    }
                  }}
                >
                  <div
                    className={`flex sm:items-center gap-4 p-3 pb-0 ${
                      issueDetails ? "flex-col sm:flex-row justify-between" : "justify-end"
                    }`}
                  >
                    {issueDetails && (
                      <div className="overflow-hidden truncate rounded-md bg-custom-background-80 p-2 text-xs font-medium text-custom-text-200">
                        {issueDetails.project_detail.identifier}-{issueDetails.sequence_id}{" "}
                        {issueDetails.name}
                      </div>
                    )}
                    {projectId && (
                      <Tooltip tooltipContent="Toggle workspace level search">
                        <div className="flex-shrink-0 self-end sm:self-center flex items-center gap-1 text-xs cursor-pointer">
                          <button
                            type="button"
                            onClick={() => setIsWorkspaceLevel((prevData) => !prevData)}
                            className="flex-shrink-0"
                          >
                            Workspace Level
                          </button>
                          <ToggleSwitch
                            value={isWorkspaceLevel}
                            onChange={() => setIsWorkspaceLevel((prevData) => !prevData)}
                          />
                        </div>
                      </Tooltip>
                    )}
                  </div>
                  <div className="relative">
                    <MagnifyingGlassIcon
                      className="pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-custom-text-200"
                      aria-hidden="true"
                    />
                    <Command.Input
                      className="w-full border-0 border-b border-custom-border-200 bg-transparent p-4 pl-11 text-custom-text-100 placeholder:text-custom-text-400 outline-none focus:ring-0 text-sm"
                      placeholder={placeholder}
                      value={searchTerm}
                      onValueChange={(e) => {
                        setSearchTerm(e);
                      }}
                      autoFocus
                      tabIndex={1}
                    />
                  </div>

                  <Command.List className="max-h-96 overflow-scroll p-2">
                    {searchTerm !== "" && (
                      <h5 className="text-xs text-custom-text-100 mx-[3px] my-4">
                        Search results for{" "}
                        <span className="font-medium">
                          {'"'}
                          {searchTerm}
                          {'"'}
                        </span>{" "}
                        in {!projectId || isWorkspaceLevel ? "workspace" : "project"}:
                      </h5>
                    )}

                    {!isLoading &&
                      resultsCount === 0 &&
                      searchTerm !== "" &&
                      debouncedSearchTerm !== "" && (
                        <div className="my-4 text-center text-custom-text-200">
                          No results found.
                        </div>
                      )}

                    {(isLoading || isSearching) && (
                      <Command.Loading>
                        <Loader className="space-y-3">
                          <Loader.Item height="40px" />
                          <Loader.Item height="40px" />
                          <Loader.Item height="40px" />
                          <Loader.Item height="40px" />
                        </Loader>
                      </Command.Loading>
                    )}

                    {debouncedSearchTerm !== "" &&
                      Object.keys(results.results).map((key) => {
                        const section = (results.results as any)[key];
                        const currentSection = commandGroups[key];

                        if (section.length > 0) {
                          return (
                            <Command.Group key={key} heading={currentSection.title}>
                              {section.map((item: any) => (
                                <Command.Item
                                  key={item.id}
                                  onSelect={() => {
                                    router.push(currentSection.path(item));
                                    setIsPaletteOpen(false);
                                  }}
                                  value={`${key}-${item?.name}`}
                                  className="focus:outline-none"
                                >
                                  <div className="flex items-center gap-2 overflow-hidden text-custom-text-200">
                                    <Icon iconName={currentSection.icon} />
                                    <p className="block flex-1 truncate">
                                      {currentSection.itemName(item)}
                                    </p>
                                  </div>
                                </Command.Item>
                              ))}
                            </Command.Group>
                          );
                        }
                      })}

                    {!page && (
                      <>
                        {issueId && (
                          <Command.Group heading="Issue actions">
                            <Command.Item
                              onSelect={() => {
                                setPlaceholder("Change state...");
                                setSearchTerm("");
                                setPages([...pages, "change-issue-state"]);
                              }}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="grid_view" />
                                Change state...
                              </div>
                            </Command.Item>
                            <Command.Item
                              onSelect={() => {
                                setPlaceholder("Change priority...");
                                setSearchTerm("");
                                setPages([...pages, "change-issue-priority"]);
                              }}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="bar_chart" />
                                Change priority...
                              </div>
                            </Command.Item>
                            <Command.Item
                              onSelect={() => {
                                setPlaceholder("Assign to...");
                                setSearchTerm("");
                                setPages([...pages, "change-issue-assignee"]);
                              }}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="group" />
                                Assign to...
                              </div>
                            </Command.Item>
                            <Command.Item
                              onSelect={() => {
                                handleIssueAssignees(user.id);
                                setSearchTerm("");
                              }}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                {issueDetails?.assignees.includes(user.id) ? (
                                  <>
                                    <Icon iconName="person_remove" />
                                    Un-assign from me
                                  </>
                                ) : (
                                  <>
                                    <Icon iconName="person_add" />
                                    Assign to me
                                  </>
                                )}
                              </div>
                            </Command.Item>
                            <Command.Item onSelect={deleteIssue} className="focus:outline-none">
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="delete" />
                                Delete issue
                              </div>
                            </Command.Item>
                            <Command.Item
                              onSelect={() => {
                                setIsPaletteOpen(false);
                                copyIssueUrlToClipboard();
                              }}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="link" />
                                Copy issue URL
                              </div>
                            </Command.Item>
                          </Command.Group>
                        )}
                        <Command.Group heading="Issue">
                          <Command.Item
                            onSelect={createNewIssue}
                            className="focus:bg-custom-background-80"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="stack" />
                              Create new issue
                            </div>
                            <kbd>C</kbd>
                          </Command.Item>
                        </Command.Group>

                        {workspaceSlug && (
                          <Command.Group heading="Project">
                            <Command.Item
                              onSelect={createNewProject}
                              className="focus:outline-none"
                            >
                              <div className="flex items-center gap-2 text-custom-text-200">
                                <Icon iconName="create_new_folder" />
                                Create new project
                              </div>
                              <kbd>P</kbd>
                            </Command.Item>
                          </Command.Group>
                        )}

                        {projectId && (
                          <>
                            <Command.Group heading="Cycle">
                              <Command.Item
                                onSelect={createNewCycle}
                                className="focus:outline-none"
                              >
                                <div className="flex items-center gap-2 text-custom-text-200">
                                  <Icon iconName="contrast" />
                                  Create new cycle
                                </div>
                                <kbd>Q</kbd>
                              </Command.Item>
                            </Command.Group>
                            <Command.Group heading="Module">
                              <Command.Item
                                onSelect={createNewModule}
                                className="focus:outline-none"
                              >
                                <div className="flex items-center gap-2 text-custom-text-200">
                                  <Icon iconName="dataset" />
                                  Create new module
                                </div>
                                <kbd>M</kbd>
                              </Command.Item>
                            </Command.Group>
                            <Command.Group heading="View">
                              <Command.Item onSelect={createNewView} className="focus:outline-none">
                                <div className="flex items-center gap-2 text-custom-text-200">
                                  <Icon iconName="photo_filter" />
                                  Create new view
                                </div>
                                <kbd>V</kbd>
                              </Command.Item>
                            </Command.Group>
                            <Command.Group heading="Page">
                              <Command.Item onSelect={createNewPage} className="focus:outline-none">
                                <div className="flex items-center gap-2 text-custom-text-200">
                                  <Icon iconName="article" />
                                  Create new page
                                </div>
                                <kbd>D</kbd>
                              </Command.Item>
                            </Command.Group>
                            {projectDetails && projectDetails.inbox_view && (
                              <Command.Group heading="Inbox">
                                <Command.Item
                                  onSelect={() =>
                                    redirect(
                                      `/${workspaceSlug}/projects/${projectId}/inbox/${inboxList?.[0]?.id}`
                                    )
                                  }
                                  className="focus:outline-none"
                                >
                                  <div className="flex items-center gap-2 text-custom-text-200">
                                    <InboxIcon className="h-4 w-4" color="#6b7280" />
                                    Open inbox
                                  </div>
                                </Command.Item>
                              </Command.Group>
                            )}
                          </>
                        )}

                        <Command.Group heading="Workspace Settings">
                          <Command.Item
                            onSelect={() => {
                              setPlaceholder("Search workspace settings...");
                              setSearchTerm("");
                              setPages([...pages, "settings"]);
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="settings" />
                              Search settings...
                            </div>
                          </Command.Item>
                        </Command.Group>
                        <Command.Group heading="Account">
                          <Command.Item
                            onSelect={createNewWorkspace}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="create_new_folder" />
                              Create new workspace
                            </div>
                          </Command.Item>
                          <Command.Item
                            onSelect={() => {
                              setPlaceholder("Change interface theme...");
                              setSearchTerm("");
                              setPages([...pages, "change-interface-theme"]);
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="settings" />
                              Change interface theme...
                            </div>
                          </Command.Item>
                        </Command.Group>
                        <Command.Group heading="Help">
                          <Command.Item
                            onSelect={() => {
                              setIsPaletteOpen(false);
                              const e = new KeyboardEvent("keydown", {
                                key: "h",
                              });
                              document.dispatchEvent(e);
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="rocket_launch" />
                              Open keyboard shortcuts
                            </div>
                          </Command.Item>
                          <Command.Item
                            onSelect={() => {
                              setIsPaletteOpen(false);
                              window.open("https://docs.plane.so/", "_blank");
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="article" />
                              Open Plane documentation
                            </div>
                          </Command.Item>
                          <Command.Item
                            onSelect={() => {
                              setIsPaletteOpen(false);
                              window.open("https://discord.com/invite/A92xrEGCge", "_blank");
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <DiscordIcon className="h-4 w-4" color="#6b7280" />
                              Join our Discord
                            </div>
                          </Command.Item>
                          <Command.Item
                            onSelect={() => {
                              setIsPaletteOpen(false);
                              window.open(
                                "https://github.com/makeplane/plane/issues/new/choose",
                                "_blank"
                              );
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <GithubIcon className="h-4 w-4" color="rgb(var(--color-text-200))" />
                              Report a bug
                            </div>
                          </Command.Item>
                          <Command.Item
                            onSelect={() => {
                              setIsPaletteOpen(false);
                              (window as any).$crisp.push(["do", "chat:open"]);
                            }}
                            className="focus:outline-none"
                          >
                            <div className="flex items-center gap-2 text-custom-text-200">
                              <Icon iconName="sms" />
                              Chat with us
                            </div>
                          </Command.Item>
                        </Command.Group>
                      </>
                    )}

                    {page === "settings" && workspaceSlug && (
                      <>
                        <Command.Item
                          onSelect={() => redirect(`/${workspaceSlug}/settings`)}
                          className="focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-custom-text-200">
                            <SettingIcon className="h-4 w-4 text-custom-text-200" />
                            General
                          </div>
                        </Command.Item>
                        <Command.Item
                          onSelect={() => redirect(`/${workspaceSlug}/settings/members`)}
                          className="focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-custom-text-200">
                            <SettingIcon className="h-4 w-4 text-custom-text-200" />
                            Members
                          </div>
                        </Command.Item>
                        <Command.Item
                          onSelect={() => redirect(`/${workspaceSlug}/settings/billing`)}
                          className="focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-custom-text-200">
                            <SettingIcon className="h-4 w-4 text-custom-text-200" />
                            Billing and Plans
                          </div>
                        </Command.Item>
                        <Command.Item
                          onSelect={() => redirect(`/${workspaceSlug}/settings/integrations`)}
                          className="focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-custom-text-200">
                            <SettingIcon className="h-4 w-4 text-custom-text-200" />
                            Integrations
                          </div>
                        </Command.Item>
                        <Command.Item
                          onSelect={() => redirect(`/${workspaceSlug}/settings/import-export`)}
                          className="focus:outline-none"
                        >
                          <div className="flex items-center gap-2 text-custom-text-200">
                            <SettingIcon className="h-4 w-4 text-custom-text-200" />
                            Import/Export
                          </div>
                        </Command.Item>
                      </>
                    )}
                    {page === "change-issue-state" && issueDetails && (
                      <ChangeIssueState
                        issue={issueDetails}
                        setIsPaletteOpen={setIsPaletteOpen}
                        user={user}
                      />
                    )}
                    {page === "change-issue-priority" && issueDetails && (
                      <ChangeIssuePriority
                        issue={issueDetails}
                        setIsPaletteOpen={setIsPaletteOpen}
                        user={user}
                      />
                    )}
                    {page === "change-issue-assignee" && issueDetails && (
                      <ChangeIssueAssignee
                        issue={issueDetails}
                        setIsPaletteOpen={setIsPaletteOpen}
                        user={user}
                      />
                    )}
                    {page === "change-interface-theme" && (
                      <ChangeInterfaceTheme setIsPaletteOpen={setIsPaletteOpen} />
                    )}
                  </Command.List>
                </Command>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
    </>
  );
};
