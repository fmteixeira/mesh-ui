import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Observable } from 'rxjs/Observable';
import { Subject } from 'rxjs/Subject';

import { Microschema } from '../../../common/models/microschema.model';
import {
    FieldSchemaFromServer,
    FieldSchemaFromServerType,
    ListTypeFieldType,
    Schema
} from '../../../common/models/schema.model';
import { FieldSchemaFromServer, SchemaResponse } from '../../../common/models/server-models';
import { simpleCloneDeep } from '../../../common/util/util';
import { EntitiesService } from '../../../state/providers/entities.service';
import { AdminSchemaEffectsService } from '../../providers/effects/admin-schema-effects.service';

/**
 * Schema Builder for UI-friendly assembly of a new schema at app route /admin/schemas/new
 */
@Component({
    selector: 'mesh-schema-editor',
    templateUrl: './schema-editor.component.html',
    styleUrls: ['./schema-editor.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SchemaEditorComponent implements OnInit, OnDestroy {
    // PROPERTIES //////////////////////////////////////////////////////////////////////////////

    /** Primary data object */
    @Input()
    get schema(): string {
        return this._schema && JSON.stringify(this._schema, undefined, 4);
    }
    set schema(value: string) {
        if (!value) {
            return;
        }
        console.log('!!! SET schema:', value);
        this._schema = JSON.parse(value);
        // if formGroup initiated, fill it with provided data
        if (this.formGroup instanceof FormGroup) {
            this.formGroup.patchValue(this._schema);
        }
    }
    @Output() schemaChange = new EventEmitter<string>();
    protected _schema: SchemaResponse;

    /** Schema form */
    formGroup: FormGroup;

    /** Emitting on Create/Save */
    @Output() save = new EventEmitter<void>();

    /** All schemas of current Mesh instance */
    allSchemas$: Observable<Schema[]>;

    /** All microschemas of current Mesh instance */
    allMicroschemas$: Observable<Microschema[]>;

    /** Stored values of schema.fields[].allow */
    allowValues: Array<Set<string>> = [];

    /** Providing data for Schema Field List Type dropdown list */
    FieldSchemaFromServerListTypes: Array<{ value: FieldSchemaFromServerType; label: string }> = [
        {
            value: 'binary',
            label: 'Binary'
        },
        {
            value: 'boolean',
            label: 'Boolean'
        },
        {
            value: 'date',
            label: 'Date'
        },
        {
            value: 'micronode',
            label: 'Micronode'
        },
        {
            value: 'node',
            label: 'Node'
        },
        {
            value: 'number',
            label: 'Number'
        },
        {
            value: 'html',
            label: 'HTML'
        },
        {
            value: 'string',
            label: 'String'
        }
    ];

    /** Providing data for Schema Field Type dropdown list */
    FieldSchemaFromServerTypes: Array<{ value: FieldSchemaFromServerType; label: string }> = [
        ...this.FieldSchemaFromServerListTypes,
        {
            value: 'list',
            label: 'List'
        }
    ];

    /** Convenience getter for form fields array */
    get FieldSchemaFromServers(): FormArray {
        return this.formGroup.get('fields') as FormArray;
    }

    /** Providing data for Schema displayFields dropdown list */
    displayFields: Array<{ value: string; label: string }> = [];

    /** Providing data for Schema segmentFields dropdown list */
    segmentFields: Array<{ value: string; label: string }> = [];

    /** Providing data for Schema urlFields dropdown list */
    urlFields: Array<{ value: string; label: string }> = [];

    private destroyed$ = new Subject<void>();

    // CONSTRUCTOR //////////////////////////////////////////////////////////////////////////////

    constructor(
        private entities: EntitiesService,
        private adminSchemaEffects: AdminSchemaEffectsService,
        private formBuilder: FormBuilder
    ) {}

    // LIFECYCLE HOOKS //////////////////////////////////////////////////////////////////////////////

    ngOnInit(): void {
        this.loadComponentData();
        this.formGroupInit();
    }

    ngOnDestroy(): void {
        this.destroyed$.next();
        this.destroyed$.complete();
    }

    // MANAGE COMPONENT DATA //////////////////////////////////////////////////////////////////////////////

    /**
     * Trigger loading of required data and assign data streams to component properties
     */
    protected loadComponentData(): void {
        // assign data streams
        this.allSchemas$ = this.entities
            .selectAllSchemas()
            .map(schemas => schemas.sort((a, b) => a.name.localeCompare(b.name)));
        this.allMicroschemas$ = this.entities
            .selectAllMicroschemas()
            .map(microschemas => microschemas.sort((a, b) => a.name.localeCompare(b.name)));
        // request data
        this.adminSchemaEffects.loadSchemas();
        this.adminSchemaEffects.loadMicroschemas();
    }

    // MANAGE FORM //////////////////////////////////////////////////////////////////////////////

    /**
     * Initialize form with empty/default data and listen to changes
     */
    protected formGroupInit(): void {
        // console.log( '!!! INIT _schema:', this._schema );
        console.log('!!! INIT schema:', this.schema);
        // build form group from provided input data or empty
        this.formGroup = this.formBuilder.group({
            name: [this._schema.name || '', Validators.required],
            container: [this._schema.container || false],
            description: [this._schema.description || ''],
            displayField: [this._schema.displayField || ''],
            segmentField: [this._schema.segmentField || ''],
            urlFields: [this._schema.urlFields || []],
            fields: this.formBuilder.array(
                this._schema.fields
                    ? this.createFieldsFromData(this._schema.fields as FieldSchemaFromServer[])
                    : [this.createNewField()]
            )
        });

        console.log('!!! formGroup:', this.formGroup.value);

        // if init value has been provided, fill related data properties
        if (this._schema && this._schema.fields instanceof Array && this._schema.fields.length > 0) {
            (this._schema.fields as FieldSchemaFromServer[]).forEach(field => {
                this.displayFields.push({ value: field.name, label: field.name });
                this.segmentFields.push({ value: field.name, label: field.name });
            });
        }

        // listen to form changes
        this.formGroup.valueChanges
            .distinctUntilChanged()
            .takeUntil(this.destroyed$)
            .subscribe((value: any) => {
                // reset data
                this.displayFields = [];
                this.segmentFields = [];

                // assign form data to component data
                this._schema = {
                    name: value.name,
                    ...(value.container && ({ container: value.container } as any)),
                    ...(value.description.length > 0 && ({ description: value.description } as any)),
                    ...(value.displayField.length > 0 && ({ displayField: value.displayField } as any)),
                    ...(value.segmentField.length > 0 && ({ segmentField: value.segmentField } as any)),
                    ...(value.urlFields instanceof Array &&
                        value.urlFields.length > 0 &&
                        ({ urlFields: value.urlFields } as any)),
                    fields: value.fields.map((field: any, index: number) => {
                        const FieldSchemaFromServer: FieldSchemaFromServer = {
                            name: field.name,
                            type: field.type,
                            ...(field.label.length > 0 && ({ label: field.label } as any)),
                            ...(field.required && ({ required: field.required } as any)),
                            ...(field.listType.length > 0 && ({ listType: field.listType as ListTypeFieldType } as any))
                        };

                        // if something has changed, clear up before saving
                        if (
                            (this._schema &&
                                this._schema.fields &&
                                this._schema.fields[index] &&
                                this._schema.fields[index].type !== field.type) ||
                            (this._schema &&
                                this._schema.fields &&
                                this._schema.fields[index] &&
                                this._schema.fields[index].listType !== field.listType)
                        ) {
                            this.allowValuesClearAt(index);
                            this.propertyPurge(field, index, 'allow');
                        }

                        // if not of type list anymore, clean up
                        if (field.type !== 'list') {
                            this.propertyPurge(field, index, 'listType');
                        }

                        // if of type string, trigger search bar functionality
                        if (field.type === 'string' || field.listType === 'string') {
                            this.allowValuesOnStringInputChangeAt(index);
                        }

                        // if allow property should exist, assign appropriate data
                        if (this.allowValues[index] && Array.from(this.allowValues[index]).length > 0) {
                            Object.assign(FieldSchemaFromServer, { allow: Array.from(this.allowValues[index]) });
                        } else {
                            this.propertyPurge(field, index, 'allow');
                        }

                        // fill data for displayFields input
                        if (field.name) {
                            this.displayFields.push({ value: field.name, label: field.name });
                            this.segmentFields.push({ value: field.name, label: field.name });
                        }

                        // EXTENDED VALIDATION LOGIC
                        this.fieldHasDuplicateValue(index, 'name');
                        this.fieldHasDuplicateValue(index, 'label');

                        return FieldSchemaFromServer;
                    })
                };
                // this.schemaChange.emit(JSON.stringify(this._schema, undefined, 4));
            });
    }

    formGroupIsValid(): boolean {
        return this.formGroup.valid;
    }

    hasNamedFields(): boolean {
        return this.displayFields.length > 0;
    }

    // MANAGE SCHEMA.FIELD[] ENTRIES //////////////////////////////////////////////////////////////////////////////

    /**
     * Initialize a new FormGroup instance and its related data analog to schema.field type
     */
    protected createNewField(): FormGroup {
        this.allowValues.push(new Set<string>());
        return this.formBuilder.group({
            name: ['', Validators.required],
            label: ['', Validators.required],
            type: ['', Validators.required],
            required: [false],
            listType: [''],
            allow: ['']
        });
    }

    protected createFieldFromData(field: FieldSchemaFromServer): FormGroup {
        if (field.allow instanceof Array && field.allow.length > 0) {
            this.allowValues.push(new Set<string>(field.allow));
        }
        return this.formBuilder.group({
            name: [field.name || '', Validators.required],
            label: [field.label || '', Validators.required],
            type: [field.type || '', Validators.required],
            required: [field.required || false],
            listType: [field.listType || ''],
            allow: [field.allow || '']
        });
    }

    protected createFieldsFromData(fields: FieldSchemaFromServer[]): FormGroup[] {
        return fields.map(field => {
            return this.createFieldFromData(field);
        });
    }

    fieldAdd(): void {
        this.FieldSchemaFromServers.push(this.createNewField());
    }

    fieldRemoveAt(index: number): void {
        this.FieldSchemaFromServers.removeAt(index);
    }

    fieldRemoveLast(): void {
        this.fieldRemoveAt(this.FieldSchemaFromServers.length - 1);
    }

    fieldHasDuplicateValue(index: number, formControlName: 'name' | 'label'): boolean {
        const fields = this.FieldSchemaFromServers.value as FieldSchemaFromServer[];
        const ownValue = fields[index][formControlName];
        // if not existing, return default
        if (!ownValue) {
            return false;
        }
        // iterate over all existing fields
        const isDuplicate =
            fields.filter((field, fieldIndex) => {
                // if own index, skip
                if (fieldIndex === index) {
                    return;
                }
                // check values
                return field[formControlName] && field[formControlName]!.toLocaleLowerCase() === ownValue.toLowerCase();
            }).length > 0;
        // notify formControl in formGroup of this extended validation logic
        const control = this.FieldSchemaFromServers.controls[index].get(formControlName);
        if (isDuplicate === true) {
            control!.setErrors({ duplicate: true });
        } else {
            control!.setErrors(null);
        }
        return isDuplicate;
    }

    getErrorFromControlOfType(formControlName: keyof Schema, errorType: string): boolean {
        return this.formGroup.get(formControlName)!.hasError(errorType);
    }

    getErrorFromControlInFromArrayOfType(
        index: number,
        formControlName: keyof FieldSchemaFromServer,
        errorType: string
    ): boolean {
        return this.FieldSchemaFromServers.controls[index].get(formControlName)!.hasError(errorType);
    }

    // MANAGE SCHEMA.FIELD[].ALLOW VALUES //////////////////////////////////////////////////////////////////////////////

    /**
     * Reset the entire allowValues Set at index
     * @param index of schmea.fields[]
     * @param values replacing previous values
     */
    allowValueSetAt(index: number, values: string[]): void {
        // update allowed data
        this.allowValues[index] = new Set<string>(values);
        // update form
        this.formGroup.updateValueAndValidity();
    }

    /**
     * add value to schema.fields[] allow[]
     * @param index of schema.fields[]
     * @param value string to be added
     * */
    allowValueAddAt(index: number, value: string): void {
        // update allowed data
        this.allowValues[index].add(value);
        // update form
        this.formGroup.updateValueAndValidity();
    }

    /**
     * remove value from schema.fields[] allow[]
     * @param index of schema.fields[]
     * @param value string to be removed
     * */
    allowValueRemoveAt(index: number, value: string): void {
        // update allowed data
        this.allowValues[index].delete(value);
        // update form
        this.formGroup.updateValueAndValidity();
    }

    /**
     * change value of schema.fields[] allow[]
     * @param index of schema.fields[]
     * @param value string to be changed
     * @param action indicator: true = add, false = remove
     */
    allowValuesChangeAt(index: number, value: string, action: boolean): void {
        if (action === true) {
            this.allowValueAddAt(index, value);
        } else {
            this.allowValueRemoveAt(index, value);
        }
    }

    allowValueRemoveLastAt(index: number): void {
        // if input bar has text, which is not yet converted to chip, don't redirect backspace key
        const form = this.formGroup.value as Schema;
        const inputText = form.fields && form.fields[index] && form.fields[index].allow;
        if (inputText && inputText.length) {
            return;
        }

        const allowValues = this.allowValues[index];
        if (!allowValues) {
            return;
        }
        const lastValue = Array.from(allowValues).pop();
        if (!lastValue) {
            return;
        }
        this.allowValueRemoveAt(index, lastValue);
    }

    /**
     * Remove all entries from allowed string values of schema field
     * @param index of field to be cleared
     */
    allowValuesClearAt(index: number): void {
        // clear data
        this.allowValues[index] = new Set();

        // clear form values
        const newForm = simpleCloneDeep(this.formGroup.value);
        const newField = newForm.fields[index];
        if (!newField.allow) {
            return;
        }
        newField.allow = '';
        this.formGroup.patchValue(newForm);
    }

    allowValuesContainsAt(index: number, value: string): boolean {
        return this.allowValues[index].has(value);
    }

    allowValueOnStringInputAddAt(index: number): void {
        const newForm = simpleCloneDeep(this.formGroup.value);
        const newField = newForm.fields[index];
        // update mesh chip array cleaned from forbiddden characters
        this.allowValues[index].add(newField.allow.replace(new RegExp(/\W/, 'g'), ''));
        // empty field after new value is displayed as chip
        newField.allow = '';
        // assign new value to form data
        this.formGroup.patchValue(newForm);
    }

    allowValuesOnStringInputChangeAt(index: number): void {
        const newForm = simpleCloneDeep(this.formGroup.value);
        const newField = newForm.fields[index];
        if (!newField.allow) {
            return;
        }
        // if input value is seperated by space or comma, then add as chip
        if (new RegExp(/\w+\W/, 'g').test(newField.allow)) {
            this.allowValueOnStringInputAddAt(index);
        }
    }

    // SCHEMA MAIN BUTTON //////////////////////////////////////////////////////////////////////////////

    schemaCreate(): void {
        console.log('!!! schemaCreate()');
        this.save.emit();
    }

    schemaDelete(): void {
        console.log('!!! schemaDelete()');
    }

    // PRIVATE METHODS //////////////////////////////////////////////////////////////////////////////

    private propertyPurge(field: any, index: number, property: keyof FieldSchemaFromServer): void {
        if (field[property]) {
            delete field[property];
        }

        if (!this._schema) {
            return;
        }
        const fieldToDelete = (this._schema.fields && (this._schema.fields[index] as FieldSchemaFromServer)) || null;
        if (fieldToDelete && fieldToDelete[property]) {
            delete fieldToDelete[property];
        }
    }
}
