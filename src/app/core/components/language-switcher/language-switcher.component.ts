import { Component } from '@angular/core';
import { Observable } from 'rxjs';

import { ApplicationStateService } from '../../../state/providers/application-state.service';
import { I18nService, UILanguage } from '../../providers/i18n/i18n.service';
import { ConfigService } from '../../providers/config/config.service';


@Component({
    selector: 'language-switcher',
    templateUrl: './language-switcher.component.html'
})
export class LanguageSwitcherComponent {

    availableLanguages: string[];
    currentLanguage$: Observable<UILanguage>;

    constructor(private appState: ApplicationStateService,
                private config: ConfigService,
                private i18n: I18nService) {
        this.availableLanguages = config.UI_LANGUAGES;
        this.currentLanguage$ = appState.select(state => state.ui.currentLanguage)
            .map(languageCode => `lang.${languageCode}` as UILanguage);
    }

    changeLanguage(language: UILanguage): void {
        this.appState.actions.ui.setLanguage(language);
        this.i18n.setLanguage(language);
    }
}
