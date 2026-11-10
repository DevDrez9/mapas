import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('devuelve la información del servicio', () => {
    const info = appController.getInfo();
    expect(info.status).toBe('ok');
    expect(info.profiles).toEqual(['car', 'moto']);
  });
});
