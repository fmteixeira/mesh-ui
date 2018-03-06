import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/Observable';
import { forkJoin } from 'rxjs/observable/forkJoin';

import { I18nNotification } from '../i18n-notification/i18n-notification.service';
import { ApiService } from '../api/api.service';
import { ApplicationStateService } from '../../../state/providers/application-state.service';
import { ConfigService } from '../config/config.service';
import { EntitiesService } from '../../../state/providers/entities.service';
import { MeshNode } from '../../../common/models/node.model';
import { NodeResponse } from '../../../common/models/server-models';
import { Tag } from '../../../common/models/tag.model';



@Injectable()
export class ListEffectsService {

    constructor(private api: ApiService,
                private config: ConfigService,
                private state: ApplicationStateService,
                private notification: I18nNotification,
                private entities: EntitiesService) {
    }

    /**
     * Load all projects
     */
    loadProjects() {

        this.state.actions.list.fetchProjectsStart();
        // TODO How to handle paging? Should all projects be loaded?
        this.api.project.getProjects({})
            .subscribe(projects => {
                this.state.actions.list.fetchProjectsSuccess(projects.data);
            }, error => {
                this.state.actions.list.fetchProjectsError();
            });
    }

    /**
     * @param project project name
     */
    loadSchemasForProject(project: string) {
        this.state.actions.list.fetchSchemasStart(project);
        this.api.project.getProjectSchemas({ project })
            .subscribe(({data}) => {
                return this.state.actions.list.fetchSchemasSuccess(project, data);
            }, error => {
                return this.state.actions.list.fetchSchemasError(); /* TODO: error handling */
            }
        );
    }

    /**
     * @param project project name
     */
    loadMicroschemasForProject(project: string) {
        this.state.actions.list.fetchMicroschemasStart();
        this.api.project.getProjectMicroschemas({ project })
            .subscribe(
                ({data}) => this.state.actions.list.fetchMicroschemasSuccess(data),
                error => this.state.actions.list.fetchMicroschemasError() /* TODO: error handling */);
    }
    /**
     * Basicaly display the content of the folder in the list view
     */
    setActiveContainer(projectName: string, containerUuid: string, language: string) {
        // Update active container in state
        this.state.actions.list.setActiveContainer(projectName, containerUuid, language);

        // Refresh the node
        this.state.actions.list.fetchNodeStart(containerUuid);
        this.api.project.getNode({ project: projectName, nodeUuid: containerUuid, lang: this.languageWithFallbacks(language) })
            .subscribe(response => {
                this.state.actions.list.fetchNodeSuccess(response);
            }, error => {
                this.state.actions.list.fetchChildrenError();
                throw new Error('TODO: Error handling');
            });

       this.loadChildren(projectName, containerUuid, language);
    }

    /**
     * Load the children for the opened folder
     */
    loadChildren(projectName: string, containerUuid: string, language: string): void {
         // Refresh child node list
        this.state.actions.list.fetchChildrenStart();
        this.api.project
            .getNodeChildren({ project: projectName, nodeUuid: containerUuid, lang: this.languageWithFallbacks(language) })
            .subscribe(response => {
                this.state.actions.list.fetchChildrenSuccess(containerUuid, response.data);
            }, error => {
                this.state.actions.list.fetchChildrenError();
                throw new Error('TODO: Error handling');
            });
    }


    searchNodesByTags(tags: Tag[], project: string, language: string): Promise<MeshNode[]> {
        const tagNames: string = tags.map(tag => tag.name).join(' ');

        this.state.actions.list.searchNodesByTagsStart();
        const query = this.api.formatGraphQLSearchQuery({
            query: {
                query_string: {
                    query: tagNames
                }
            }
        });

        const queryString = `{
            tags (query: ${query}) {
                elements {
                    name,
                    uuid,
                    tagFamily {
                        name
                    },
                    nodes {
                        elements {
                            uuid
                        }
                    }
                }
            }
        }`;


        return new Promise((resolve, reject) => {
            this.api.graphQL({ project }, { query: queryString })
            .subscribe(results => {
                if (results.data) {
                    if (results.data.tags.elements.length === 0) {
                        this.state.actions.list.searchNodesByTagsSuccess(results);
                        resolve([]);
                    } else {
                        const foundNodesForTags: string[] = [];
                        results.data.tags.elements.forEach(tag =>
                            tag.nodes.elements.forEach(node => foundNodesForTags.push(node.uuid)));

                        if (foundNodesForTags.length === 0) {
                            resolve([]);
                        } else {
                            forkJoin<NodeResponse>(foundNodesForTags.map(nodeUuid => {
                                this.state.actions.list.fetchNodeStart(nodeUuid);
                                const existingNode = this.entities.getNode(nodeUuid, { language });
                                if (existingNode) {
                                    return Observable.of(existingNode);
                                } else {
                                    return this.api.project.getNode({project, nodeUuid})
                                        .catch((err, cought) => {
                                            return Observable.of(null);
                                        });
                                }
                            }))
                            .first()
                            .subscribe(nodes => {
                                const filteredNodes = nodes.filter(node => node != null);
                                filteredNodes.map(node => this.state.actions.list.fetchNodeSuccess(node));
                                this.state.actions.list.searchNodesByTagsSuccess(results);
                                resolve(filteredNodes);
                            });
                        }
                    }
                } else {
                    this.state.actions.list.searchNodesByTagsError(results);
                    this.notification.show({
                        type: 'error',
                        message: 'list.search_error_occured'
                    });
                }
            });
        });
    }

    /**
     * Load the children for the opened folder
     */
    searchNodesByKeyword(term: string, project: string, language: string): Promise<MeshNode[]> {
        this.state.actions.list.searchNodesByKeywordStart();
        const query = this.api.formatGraphQLSearchQuery({
            query: {
                query_string: {
                    query: term
                }
            }
        });

        const queryString = `{
            nodes (query: ${query}) {
                elements {
                  displayName,
                  uuid,
                }
            }
        }`;

        return new Promise((resolve, reject) => {
            this.api.graphQL({ project }, { query: queryString })
            .subscribe(results => {
                if (results.data) {
                    if (results.data.nodes.elements.length === 0) {
                        this.state.actions.list.searchNodesByKeywordSuccess(results);
                        resolve([]);
                    } else {
                        forkJoin<NodeResponse>(results.data.nodes.elements.map(node => {
                            this.state.actions.list.fetchNodeStart(node.uuid);

                            const existingNode = this.entities.getNode(node.uuid, { language });
                            if (existingNode) {
                                return Observable.of(existingNode);
                            } else {
                                return this.api.project.getNode({project, nodeUuid: node.uuid})
                                    .catch((err, cought) => {
                                        return Observable.of(null);
                                    });
                            }
                        }))
                        .first()
                        .subscribe(nodes => {
                            const filteredNodes = nodes.filter(node => node !== null);
                            filteredNodes.map(node => {
                                this.state.actions.list.fetchNodeSuccess(node);
                            });
                            this.state.actions.list.searchNodesByKeywordSuccess(results);
                            resolve(filteredNodes);
                        });
                    }
                } else {
                    this.state.actions.list.searchNodesByKeywordError(results);
                    this.notification.show({
                        type: 'error',
                        message: 'list.search_error_occured'
                    });
                }
            });
        });
    }

    /**
     * make a comma seperated list of langues. Put the passed language in front
     */
    private languageWithFallbacks(language: string): string {
        return this.config.CONTENT_LANGUAGES
            .sort((a, b) => a === language ? -1 : 1)
            .join(',');
    }

    public deleteNode(node: MeshNode, recursive: boolean): void {
        this.state.actions.list.deleteNodeStart();
        this.api.project.deleteNode({ project: node.project.name, nodeUuid: node.uuid, recursive })
            .subscribe(result => {
                this.state.actions.list.deleteNodeSuccess();
                const parentNode = this.entities.getNode(node.parentNode.uuid, { language: node.language });
                this.loadChildren(parentNode.project.name, parentNode.uuid, parentNode.language);
        }, error => {
            this.state.actions.list.deleteNodeError();
            throw new Error('TODO: Error handling');
        })
    }

    public setFilterTerm(term: string) {
        this.state.actions.list.setFilterTerm(term);
    }
}
