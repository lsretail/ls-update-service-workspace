import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { WorkspaceFolder, Uri } from 'vscode';

import { WorkspaceService } from '../../../workspaceService/services/workspaceService';
import { AnotherTestService } from './AnotherTestService';
import { TestService } from './TestService';
// import * as myExtension from '../../extension';

suite('WorkspaceService Test', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('One service', () => {

		let workspaceService = new WorkspaceService();
        let workspaceFolder: WorkspaceFolder = {
            index: 0,
            name: "My Name",
            uri: Uri.parse("c:\\temp\\asdf")

		}
		let expected = 'woerui';
        let container = workspaceService.register<TestService>(TestService, (value) => { return new TestService(expected); });
		let service = container.getService(workspaceFolder);
		
		assert.strictEqual(service.value, expected);
	});

	test('Two services', () => {

		let workspaceService = new WorkspaceService();
        let workspaceFolder: WorkspaceFolder = {
            index: 0,
            name: "My Name",
            uri: Uri.parse("c:\\temp\\asdf")

		}
		let expected = 'the test service';
		let anotherExpected = 'another test service';

		let container = workspaceService.register<TestService>(TestService, (value) => { return new TestService(expected); });
		let anotherContainer = workspaceService.register<AnotherTestService>(AnotherTestService, (value) => { return new AnotherTestService(anotherExpected); });

		let service = container.getService(workspaceFolder);
		let anotherService = anotherContainer.getService(workspaceFolder);
		
		assert.strictEqual(service.value, expected);
		assert.strictEqual(anotherService.value, anotherExpected);
	});
});
