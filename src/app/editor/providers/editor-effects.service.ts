import { Injectable } from '@angular/core';
import { ApplicationStateService } from '../../state/providers/application-state.service';
import { ApiService } from '../../core/providers/api/api.service';
import { MeshNode } from '../../common/models/node.model';
import { NodeUpdateRequest } from '../../common/models/server-models';
import { I18nNotification } from '../../core/providers/i18n-notification/i18n-notification.service';
import { ConfigService } from '../../core/providers/config/config.service';

@Injectable()
export class EditorEffectsService {

    constructor(private state: ApplicationStateService,
                private notification: I18nNotification,
                private config: ConfigService,
                private api: ApiService) {}

    openNode(projectName: string, nodeUuid: string, language?: string): void {
        // TODO: Make API call to get the node
        const lang = language || this.config.FALLBACK_LANGUAGE;
        this.state.actions.editor.openNode(projectName, nodeUuid, lang);

        // Refresh the node
        this.state.actions.list.fetchNodeStart(nodeUuid);
        this.api.project.getProjectNode({ project: projectName, nodeUuid, lang })
            .subscribe(response => {
                this.state.actions.list.fetchNodeSuccess(response);
            }, error => {
                this.state.actions.list.fetchChildrenError();
                throw new Error('TODO: Error handling');
            });
    }

    closeEditor(): void {
        this.state.actions.editor.closeEditor();
    }

    saveNode(node: MeshNode): Promise<MeshNode | void> {
        if (!node.project.name) {
            throw new Error('Project name is not available');
        }
        this.state.actions.editor.saveNodeStart();
        const updateRequest: NodeUpdateRequest = {
            fields: node.fields,
            version: node.version,
            language: node.language || this.config.FALLBACK_LANGUAGE
        };
        const language = node.language || this.config.FALLBACK_LANGUAGE;

        return this.api.project.updateNode({ project: node.project.name, nodeUuid: node.uuid, language }, updateRequest)
            .toPromise()
            .then(response => {
                    if (response.conflict) {
                        // TODO: conflict resolution handling
                    } else if (response.node) {
                        this.state.actions.editor.saveNodeSuccess(response.node);
                        this.notification.show({
                            type: 'success',
                            message: 'editor.node_saved'
                        });
                        return response.node;
                    }
                    this.state.actions.editor.saveNodeError();
                },
                error => {
                    this.state.actions.editor.saveNodeError();
                    this.notification.show({
                        type: 'error',
                        message: 'editor.node_save_error'
                    });
                    throw new Error('TODO: Error handling');
                });
    }

    publishNode(node: MeshNode): void {
        if (!node.project.name) {
            throw new Error('Project name is not available');
        }
        this.state.actions.editor.publishNodeStart();
        this.api.project.publishNode({ project: node.project.name, nodeUuid: node.uuid })
            .map(response => {
                let newVersion: string | undefined;
                if (response.availableLanguages && node.language) {
                    newVersion = response.availableLanguages[node.language!].version;
                }
                if (newVersion) {
                    return newVersion;
                } else {
                    throw new Error('New version could not be retrieved');
                }
            })
            .subscribe(version => {
                    this.notification.show({
                        type: 'success',
                        message: 'editor.node_published',
                        translationParams: { version }
                    });
                    const newNode = Object.assign({}, node, { version });
                    this.state.actions.editor.publishNodeSuccess(newNode);
                },
                error => {
                    this.state.actions.editor.publishNodeError();
                    this.notification.show({
                        type: 'error',
                        message: 'editor.node_publish_error'
                    });
                    throw new Error('TODO: Error handling');
                });
    }
}
