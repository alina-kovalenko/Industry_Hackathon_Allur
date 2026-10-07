# Данные и воспроизводимость

Авторы внешних источников: **Xpert Systems Inc** — MFG-005 Manufacturing Line Performance Dataset (Sample); **Panos Ntoas**, University of Cyprus — Overall Equipment Effectiveness and Downtime datasets in Heavy Clay production line; **Andryan Nugraha, Hubertus Davy Yulianto, Irma Ratna Avianti**, BINUS — Dataset for A Smart Manufacturing Approach to Enhancing the Reliability of Visual Inspection in the Automotive Industry. Ссылки и лицензии приведены ниже. Созданные в проекте профили, признаки и модель являются преобразованиями этих данных, а не исходными авторскими результатами.

Скрипт загрузки кладёт исходные файлы в `data/external/raw/`; эта папка исключена из Git. Запустите из корня репозитория:

```powershell
python scripts/download_data.py
python scripts/profile_data.py
python scripts/train.py
```

Загрузчик закреплён на конкретном commit Hugging Face и записях Zenodo. Он сохраняет provenance и проверяет опубликованные MD5 Zenodo; Hugging Face фиксирует commit в URL и SHA-256 в manifest. Не заменяйте версии источников без нового профиля и отчёта.

| Источник | Состав и единица наблюдения | Использование |
|---|---|---|
| [XpertSystems MFG-005 sample](https://huggingface.co/datasets/xpertsystems/mfg005-sample/tree/427854b6ec8cddc3f929685d9efd58bfdc2a8af3), CC BY-NC 4.0 | 3 000 **синтетических** наблюдений «линия-смена», 36 линий, 2020-01-01—2024-12-30 | Только этот набор обучает и оценивает экспериментальный классификатор следующей записи. |
| [Zenodo 17855209](https://doi.org/10.5281/zenodo.17855209), CC BY 4.0 | Реальная линия тяжёлой глины: 65 смен до улучшения, 43 после, 635 событий простоя до улучшения | Отдельный описательный профиль; домен, линия и этап улучшения отличаются. Не обучает модель Allur. |
| [Zenodo 17649175](https://doi.org/10.5281/zenodo.17649175), CC BY 4.0 | Анонимизированные месячные агрегаты автомобильной визуальной инспекции, включая OEE, простой и Cpk | Отдельный описательный профиль; месячный шаг и качество инспекции нельзя объединять со сменными рядами. |

Сводные числа пересчитываются `scripts/profile_data.py` и записаны в `data/external/profiles.json`. Эти три источника не склеиваются: они относятся к разным заводам, процессам, единицам времени и типам записи. Измеренные агрегаты используются для иллюстрации контекста, но не считаются подтверждением точности на Allur.

`data/external/manifest.json` описывает имена, URL, лицензии, размер и контрольные суммы файлов. Не публикуйте необработанные файлы без проверки условий лицензии источника. MFG-005 имеет ограничение CC BY-NC 4.0.
