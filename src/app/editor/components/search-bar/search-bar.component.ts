import { Component, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { ApiService } from '../../../core/providers/api/api.service';
import { clearTimeout } from 'timers';
import { ListStateActions } from '../../../state/providers/list-state-actions';
import { ApplicationStateService } from '../../../state/providers/application-state.service';

@Component({
    selector: 'search-bar',
    templateUrl: './search-bar.component.html',
    styleUrls: ['./search-bar.scss']
})

export class SearchBarComponent {
    protected searching = false;
    private searchTimeout: NodeJS.Timer;

    constructor(
        private changeDetectorRef: ChangeDetectorRef,
        private api: ApiService,
        private state: ApplicationStateService
    ) {}

    search(fraze: string) {
        this.searching = true;
        console.log("I will do a search");
        this.api.project.searchNodes({lang: 'En'}, undefined)
        //this.listActions.setFilter(fraze);
        //clearTimeout(this.searchTimeout);
        /*this.searchTimeout = setTimeout(() => {
            this.searching = false;
            this.changeDetectorRef.detectChanges();
        }, 1000);*/
    }

    filter(fraze: string) {
        this.state.actions.list.setFilter(fraze);
    }
}
