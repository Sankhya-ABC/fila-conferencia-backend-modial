import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayClient } from '../gateway/gateway.client';

interface LoadRecordsParams {
  rootEntity: string;
  fieldset?: string;
  criteria?: {
    expression: string;
    parameters?: {
      value: string | number | boolean | Date;
      type: 'S' | 'I' | 'D' | 'B';
    }[];
  };
  joins?: {
    path: string;
    fieldset?: string;
  }[];
  modifiedSince?: string;
  offsetPage?: number;
  limit?: number;
}

@Injectable()
export class SankhyaLoadRecordsClient {
  private readonly endpoint: string;

  constructor(
    private readonly gateway: GatewayClient,
    config: ConfigService,
  ) {
    this.endpoint = `/${config.getOrThrow('SNK_LOAD_RECORDS')}`;
  }

  async loadRecords({
    rootEntity,
    fieldset,
    criteria,
    joins = [],
    modifiedSince,
    offsetPage = 0,
    limit,
  }: LoadRecordsParams) {
    if (!rootEntity) {
      throw new HttpException('rootEntity é obrigatório', 400);
    }

    const body: any = {
      serviceName: 'CRUDServiceProvider.loadRecords',
      requestBody: {
        dataSet: {
          rootEntity,
          ignoreCalculatedFields: 'true',
          useFileBasedPagination: 'true',
          includePresentationFields: 'N',
          tryJoinedFields: 'true',
          offsetPage: String(offsetPage),
        },
      },
    };

    if (modifiedSince) {
      body.requestBody.dataSet.modifiedSince = modifiedSince;
    }

    if (criteria?.expression) {
      const criteriaBody: any = {
        expression: { $: criteria.expression },
      };
      if (criteria.parameters?.length) {
        criteriaBody.parameter = criteria.parameters.map((param) => ({
          $: String(param.value),
          type: param.type,
        }));
      }
      body.requestBody.dataSet.criteria = criteriaBody;
    }

    const entityList: any[] = [];

    if (fieldset) {
      entityList.push({
        path: '',
        fieldset: { list: fieldset },
      });
    }

    joins.forEach((join) => {
      const entry: any = { path: join.path };
      if (join.fieldset) entry.fieldset = { list: join.fieldset };
      entityList.push(entry);
    });

    if (entityList.length) {
      body.requestBody.dataSet.entity = entityList;
    }

    if (limit) {
      body.requestBody.dataSet.limit = String(limit);
    }

    try {
      const response = await this.gateway.client.post(this.endpoint, body);
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error?.response?.data ||
          'Erro ao executar CRUDServiceProvider.loadRecords',
        error?.response?.status || 500,
      );
    }
  }

  parseEntities(rawResponse: any): Record<string, any>[] {
    const entities = rawResponse?.responseBody?.entities;
    if (!entities?.metadata?.fields?.field) return [];

    const fields = entities.metadata.fields.field;
    const fieldNames: string[] = Array.isArray(fields)
      ? fields.map((f: any) => f.name)
      : [fields.name];

    const entityData = entities.entity;
    const rows = Array.isArray(entityData)
      ? entityData
      : entityData
        ? [entityData]
        : [];

    return rows.map((row: any) => {
      const obj: Record<string, any> = {};
      fieldNames.forEach((name, i) => {
        const cell = row[`f${i}`];
        obj[name] = cell?.['$'] ?? null;
      });
      return obj;
    });
  }

  hasNextPage(rawResponse: any): boolean {
    return rawResponse?.responseBody?.entities?.hasMoreResult === 'true';
  }
}
